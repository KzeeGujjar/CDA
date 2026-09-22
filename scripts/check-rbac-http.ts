/**
 * End-to-end authorization (RBAC) check over real HTTP. Run with `npm run check:rbac-http` against a
 * RUNNING app on a THROWAWAY, migrated + seeded database (writes test data).
 *
 *  Part A - driven by the route manifest: for EVERY endpoint and EVERY built-in role, the actual HTTP
 *           decision must equal what the role's permissions say (denied => exactly 403; allowed => never
 *           401/403), and no endpoint may answer without a session unless it is on the public allowlist.
 *  Part B - scenarios: privilege-escalation attempts, role/permission editing, scope enforcement,
 *           immediate effect of changes, cross-tenant access, denial auditing.
 *
 * Needs CHECK_DB_ALLOW_WRITES=1, DIRECT_DATABASE_URL (owner, test setup), COOKIE_SECURE (same as the app).
 * Start the app with EMAIL_TRANSPORT=file EMAIL_OUTBOX_FILE=<file> EMAIL_ALLOW_FILE_TRANSPORT=1 (a few
 * scenarios send invitations) and COOKIE_SECURE=false.
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { roleKeys } from "@/lib/settings-roles";
import { rolePermissionsFixture } from "@/mock/role-permissions";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { loadRouteManifest, routeKey } from "./lib/route-manifest";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];
const nextIp = () => `10.${runOctets[0]}.${runOctets[1] + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function call(path: string, init: { token?: string; method?: string; body?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": nextIp() };
  if (init.token) headers.cookie = `${sessionCookieName()}=${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // no body
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any };
}

// ── test tenants ────────────────────────────────────────────────────────────────────────────────
type RoleKey = (typeof roleKeys)[number];
async function makeOrg(label: string) {
  const org = await db.organization.create({
    data: { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com` },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const branches = [] as { id: string; name: string }[];
  for (const name of ["Downtown", "Airport"]) {
    branches.push(
      await db.branch.create({
        data: { organizationId: org.id, name: `${label}-${name}` },
        select: { id: true, name: true },
      })
    );
  }
  const users = {} as Record<string, { id: string; token: string; email: string }>;
  const mkUser = async (key: string, roleId: string, branchIds: string[] = []) => {
    const email = `${key}-${label}-${suffix}@example.com`.toLowerCase();
    const user = await db.user.create({
      data: { organizationId: org.id, roleId, name: `${key} ${label}`, email, status: "ACTIVE" },
    });
    for (const branchId of branchIds)
      await db.userBranch.create({ data: { userId: user.id, branchId, organizationId: org.id } });
    const token = (await createSession(db, { organizationId: org.id, userId: user.id })).token;
    return (users[key] = { id: user.id, token, email });
  };
  for (const key of roleKeys.filter((k) => k !== "superAdmin"))
    await mkUser(key, roles[key], key === "salesperson" ? [branches[0].id] : []);
  return { org, roles, branches, users, mkUser };
}

async function main() {
  const X = await makeOrg("Xray");
  const Y = await makeOrg("Yankee");
  const tokens = (k: string) => X.users[k].token;

  // ═════════════════════ PART A: every endpoint x every role ═════════════════════
  const { entries, violations } = loadRouteManifest();
  ok("route manifest has no violations", violations.length === 0, violations.join("; "));
  const held = new Map<RoleKey, Set<string>>();
  for (const key of roleKeys.filter((k) => k !== "superAdmin")) {
    const rows = await db.rolePermission.findMany({
      where: { roleId: X.roles[key] },
      include: { permission: { select: { key: true } } },
    });
    held.set(key, new Set(rows.map((r) => r.permission.key)));
  }
  const fill = (url: string) => url.replace(/:\w+/g, "nonexistent-id");
  let decisions = 0;
  const wrong: string[] = [];
  for (const e of entries) {
    const url = fill(e.url);
    const body = e.method === "GET" || e.method === "DELETE" ? undefined : {};
    if (e.access.kind === "public") {
      const r = await call(url, { method: e.method, body });
      if (r.status === 401 || r.status === 403)
        wrong.push(`${routeKey(e)} (public) answered ${r.status} without a session`);
      decisions++;
      continue;
    }
    const anon = await call(url, { method: e.method, body });
    decisions++;
    if (anon.status !== 401) wrong.push(`${routeKey(e)} answered ${anon.status} WITHOUT a session (expected 401)`);
    for (const key of roleKeys.filter((k) => k !== "superAdmin")) {
      const r = await call(url, { method: e.method, body, token: tokens(key) });
      decisions++;
      if (e.access.kind === "self") {
        if (r.status === 401 || r.status === 403)
          wrong.push(`${routeKey(e)} (own data) refused ${key} with ${r.status}`);
        continue;
      }
      const roleHeld = held.get(key)!;
      const allowed =
        roleHeld.has(`${e.access.resource}:${e.access.action}`) &&
        (!e.access.also || roleHeld.has(`${e.access.also.resource}:${e.access.also.action}`));
      if (!allowed && r.status !== 403)
        wrong.push(
          `${routeKey(e)}: ${key} lacks ${e.access.resource}:${e.access.action} but got ${r.status} (expected 403)`
        );
      if (allowed && (r.status === 401 || r.status === 403))
        wrong.push(`${routeKey(e)}: ${key} holds ${e.access.resource}:${e.access.action} but got ${r.status}`);
      if (!allowed && r.status === 403 && r.json?.code !== "forbidden")
        wrong.push(`${routeKey(e)}: 403 for ${key} without the standard error body`);
    }
  }
  ok(
    `all ${decisions} endpoint/role decisions match the permission model`,
    wrong.length === 0,
    wrong.slice(0, 6).join(" | ")
  );
  ok(
    "the manifest covers permission-gated, own-data and public endpoints",
    ["permission", "self", "public"].every((k) => entries.some((e) => e.access.kind === k))
  );

  // ═════════════════════ PART B: scenarios ═════════════════════
  // B1. the API's matrix equals the frontend's permission matrix for a fresh organization
  const matrix0 = await call("/api/v1/rbac/matrix", { token: tokens("dealerOwner") });
  ok(
    "GET /rbac/matrix equals the frontend's permission matrix exactly",
    JSON.stringify(sortDeep(matrix0.json)) === JSON.stringify(sortDeep(rolePermissionsFixture))
  );

  // B2. catalog and role list
  const catalog = await call("/api/v1/rbac/catalog", { token: tokens("dealerOwner") });
  ok(
    "catalog lists resources but never the platform-only permission",
    catalog.status === 200 &&
      catalog.json.resources.some((r: { resource: string }) => r.resource === "vehicles") &&
      !catalog.json.resources.some((r: { resource: string }) => r.resource === "platform")
  );
  const rolesOwner = await call("/api/v1/rbac/roles", { token: tokens("dealerOwner") });
  const byKey = (list: { key: string; editable: boolean }[]) => Object.fromEntries(list.map((r) => [r.key, r]));
  const ro = byKey(rolesOwner.json);
  ok("owner sees the 7 built-in roles", rolesOwner.json.length === 7 && !!ro.dealerOwner && !!ro.viewer);
  ok(
    "owner can edit other roles but the Dealer Owner role is locked",
    ro.manager.editable === true && ro.dealerOwner.editable === false
  );
  const rolesMgr = await call("/api/v1/rbac/roles", { token: tokens("manager") });
  ok(
    "a manager can view roles but cannot edit any",
    rolesMgr.status === 200 && rolesMgr.json.every((r: { editable: boolean }) => r.editable === false)
  );
  const detail = await call(`/api/v1/rbac/roles/${X.roles.salesperson}`, { token: tokens("dealerOwner") });
  ok(
    "role detail lists permissions with scopes",
    detail.status === 200 &&
      detail.json.permissions.some(
        (p: { permission: string; scope: string }) => p.permission === "leads:read" && p.scope === "own"
      )
  );

  // B3. editing a role takes effect on the very next request
  const salesGrants = detail.json.permissions.map((p: { permission: string; scope: string }) => ({
    permission: p.permission,
    scope: p.scope,
  }));
  const meBefore = await call("/api/v1/auth/me", { token: tokens("salesperson") });
  ok("salesperson does not start with vehicles:update", !("vehicles:update" in meBefore.json.permissions));
  const grantEdit = await call(`/api/v1/rbac/roles/${X.roles.salesperson}/permissions`, {
    method: "PUT",
    token: tokens("dealerOwner"),
    body: { permissions: [...salesGrants, { permission: "vehicles:update", scope: "organization" }] },
  });
  ok("owner adds a permission to a role (200)", grantEdit.status === 200);
  const meAfter = await call("/api/v1/auth/me", { token: tokens("salesperson") });
  ok(
    "...and the salesperson has it on their NEXT request (no re-login)",
    meAfter.json.permissions["vehicles:update"] === "organization"
  );
  const revokeEdit = await call(`/api/v1/rbac/roles/${X.roles.salesperson}/permissions`, {
    method: "PUT",
    token: tokens("dealerOwner"),
    body: { permissions: salesGrants },
  });
  ok(
    "owner removes it again",
    revokeEdit.status === 200 &&
      !("vehicles:update" in (await call("/api/v1/auth/me", { token: tokens("salesperson") })).json.permissions)
  );
  const audited = await db.auditLog.findFirst({
    where: {
      organizationId: X.org.id,
      action: "role.permissions.updated",
      metadata: { path: ["added"], string_contains: "vehicles:update" },
    },
  });
  ok("the change was audited with what was added", !!audited);

  // B4. a manager who is given roles:manage still cannot escalate
  const mgrDetail = await call(`/api/v1/rbac/roles/${X.roles.manager}`, { token: tokens("dealerOwner") });
  const mgrGrants = mgrDetail.json.permissions.map((p: { permission: string; scope: string }) => ({
    permission: p.permission,
    scope: p.scope,
  }));
  const giveManage = await call(`/api/v1/rbac/roles/${X.roles.manager}/permissions`, {
    method: "PUT",
    token: tokens("dealerOwner"),
    body: { permissions: [...mgrGrants, { permission: "roles:manage", scope: "organization" }] },
  });
  ok("owner grants roles:manage to the Manager role", giveManage.status === 200);
  const M = tokens("manager");
  const put = (roleId: string, permissions: unknown[], token = M) =>
    call(`/api/v1/rbac/roles/${roleId}/permissions`, { method: "PUT", token, body: { permissions } });
  const notHeld = await put(X.roles.salesperson, [
    ...salesGrants,
    { permission: "billing:manage", scope: "organization" },
  ]);
  ok(
    "a manager cannot grant a permission they do not hold (billing:manage)",
    notHeld.status === 403 && notHeld.json.code === "permission_not_held"
  );
  const wideScope = await put(X.roles.salesperson, [
    { permission: "roles:manage", scope: "organization" },
    { permission: "roles:read", scope: "organization" },
  ]);
  ok("...and can grant permissions they DO hold", wideScope.status === 200);
  await put(X.roles.salesperson, salesGrants);
  const editOwner = await put(X.roles.dealerOwner, []);
  ok(
    "nobody can edit the Dealer Owner role (locked)",
    editOwner.status === 409 && editOwner.json.code === "role_locked"
  );
  const editSelf = await put(X.roles.manager, mgrGrants);
  ok("a manager cannot edit their own role", editSelf.status === 409 && editSelf.json.code === "cannot_edit_own_role");
  const editAccountant = await put(X.roles.accountant, []);
  ok(
    "a manager cannot manage a role that can do more than they can (accountant: billing:manage)",
    editAccountant.status === 403 && editAccountant.json.code === "role_exceeds_authority"
  );
  ok(
    "a manager can manage a role within their authority (viewer)",
    (
      await put(X.roles.viewer, [
        { permission: "vehicles:read", scope: "organization" },
        { permission: "reports:read", scope: "organization" },
        { permission: "notifications:read", scope: "organization" },
        { permission: "organization:read", scope: "organization" },
      ])
    ).status === 200
  );
  const tooHigh = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: M,
    body: { name: "Super Manager", rank: 80, permissions: [] },
  });
  ok(
    "a manager cannot create a role ranked above their own",
    tooHigh.status === 403 && tooHigh.json.code === "role_rank_exceeded"
  );
  const platform = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: tokens("dealerOwner"),
    body: { name: "Root", rank: 10, permissions: [{ permission: "platform:manage" }] },
  });
  ok(
    "platform:manage can never be granted inside an organization (not even by the owner)",
    platform.status === 400 && platform.json.code === "unknown_permission"
  );
  ok(
    "unknown permissions are rejected",
    (
      await call("/api/v1/rbac/roles", {
        method: "POST",
        token: M,
        body: { name: "Bogus", rank: 10, permissions: [{ permission: "foo:bar" }] },
      })
    ).status === 400
  );
  const custom = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: M,
    body: {
      name: "Junior Sales",
      rank: 30,
      permissions: [{ permission: "vehicles:read" }, { permission: "leads:read", scope: "branch" }],
    },
  });
  ok(
    "a manager can create a lower-ranked custom role from permissions they hold",
    custom.status === 201 &&
      custom.json.isSystem === false &&
      custom.json.key.startsWith("custom-") &&
      custom.json.permissions.length === 2
  );
  ok(
    "duplicate role names are refused",
    (
      await call("/api/v1/rbac/roles", {
        method: "POST",
        token: M,
        body: { name: "junior sales", rank: 10, permissions: [] },
      })
    ).status === 409
  );
  ok(
    "built-in roles cannot be deleted",
    (await call(`/api/v1/rbac/roles/${X.roles.viewer}`, { method: "DELETE", token: M })).json.code === "role_locked"
  );

  // scope escalation: holding a permission at a narrower scope does not allow granting it wider
  const lead = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: tokens("dealerOwner"),
    body: {
      name: "Team Lead",
      rank: 45,
      permissions: [
        { permission: "roles:read" },
        { permission: "roles:manage" },
        { permission: "leads:read", scope: "own" },
        { permission: "users:read" },
      ],
    },
  });
  const leadUser = await X.mkUser("teamlead", lead.json.id);
  const wider = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: leadUser.token,
    body: { name: "Wide Leads", rank: 10, permissions: [{ permission: "leads:read", scope: "organization" }] },
  });
  ok(
    "holding leads:read at 'own' scope does not allow granting it at 'organization' scope",
    wider.status === 403 && wider.json.code === "permission_not_held"
  );
  ok(
    "...but granting it at 'own' scope is fine",
    (
      await call("/api/v1/rbac/roles", {
        method: "POST",
        token: leadUser.token,
        body: { name: "Own Leads", rank: 10, permissions: [{ permission: "leads:read", scope: "own" }] },
      })
    ).status === 201
  );

  // B5. assigning roles to people
  const spare = await X.mkUser("spare", X.roles.viewer);
  const assign = (userId: string, roleId: string, token = M, extra: object = {}) =>
    call(`/api/v1/users/${userId}/role`, { method: "PATCH", token, body: { roleId, ...extra } });
  const ok1 = await assign(spare.id, X.roles.salesperson);
  ok(
    "a manager can assign a lower role (viewer -> salesperson)",
    ok1.status === 200 && ok1.json.role === "salesperson"
  );
  ok(
    "...effective on the person's next request",
    (await call("/api/v1/auth/me", { token: spare.token })).json.user.role === "salesperson"
  );
  ok(
    "a manager cannot assign the Dealer Owner role",
    (await assign(spare.id, X.roles.dealerOwner)).json.code === "role_rank_exceeded"
  );
  ok(
    "a manager cannot change the owner's role (outranks them)",
    (await assign(X.users.dealerOwner.id, X.roles.viewer)).json.code === "role_rank_exceeded"
  );
  ok(
    "nobody can change their own role",
    (await assign(X.users.manager.id, X.roles.viewer)).json.code === "cannot_change_own_role"
  );
  const finance = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: tokens("dealerOwner"),
    body: { name: "Finance Plus", rank: 20, permissions: [{ permission: "billing:manage" }] },
  });
  ok(
    "a manager cannot assign a role that carries permissions they lack",
    (await assign(spare.id, finance.json.id)).json.code === "role_exceeds_authority"
  );
  ok("a role id from ANOTHER organization -> 404", (await assign(spare.id, Y.roles.viewer)).status === 404);
  ok("a user id from ANOTHER organization -> 404", (await assign(Y.users.viewer.id, X.roles.viewer)).status === 404);
  ok("unknown body fields are rejected", (await assign(spare.id, X.roles.viewer, M, { rank: 999 })).status === 400);
  const inUse = await call(`/api/v1/rbac/roles/${custom.json.id}`, { method: "DELETE", token: M });
  ok("a custom role that nobody uses can be deleted", inUse.status === 200);
  ok(
    "a custom role still in use cannot be deleted",
    (await call(`/api/v1/rbac/roles/${lead.json.id}`, { method: "DELETE", token: tokens("dealerOwner") })).json.code ===
      "role_in_use"
  );

  // B6. the frontend-style matrix editor
  const current = (await call("/api/v1/rbac/matrix", { token: tokens("dealerOwner") })).json;
  const noop = await call("/api/v1/rbac/matrix", { method: "PUT", token: tokens("dealerOwner"), body: current });
  ok(
    "PUT of the full unchanged matrix is a no-op (200)",
    noop.status === 200 && JSON.stringify(sortDeep(noop.json)) === JSON.stringify(sortDeep(current))
  );
  const on = await call("/api/v1/rbac/matrix", {
    method: "PUT",
    token: tokens("dealerOwner"),
    body: { marketing: { viewer: true } },
  });
  ok("owner enables a module for a role", on.status === 200 && on.json.marketing.viewer === true);
  ok(
    "...which grants read only",
    (await call("/api/v1/auth/me", { token: tokens("viewer") })).json.permissions["marketing:read"] ===
      "organization" &&
      !("marketing:create" in (await call("/api/v1/auth/me", { token: tokens("viewer") })).json.permissions)
  );
  const off = await call("/api/v1/rbac/matrix", {
    method: "PUT",
    token: tokens("dealerOwner"),
    body: { marketing: { viewer: false } },
  });
  ok("disabling a module removes every permission on it", off.status === 200 && off.json.marketing.viewer === false);
  ok(
    "a manager cannot enable a module they lack (billing)",
    (await call("/api/v1/rbac/matrix", { method: "PUT", token: M, body: { billing: { viewer: true } } })).json.code ===
      "permission_not_held"
  );
  ok(
    "nobody can switch off the Dealer Owner's access",
    (
      await call("/api/v1/rbac/matrix", {
        method: "PUT",
        token: tokens("dealerOwner"),
        body: { reports: { dealerOwner: false } },
      })
    ).json.code === "role_locked"
  );
  ok(
    "a manager cannot change their own row",
    (await call("/api/v1/rbac/matrix", { method: "PUT", token: M, body: { marketing: { manager: false } } })).json
      .code === "cannot_edit_own_role"
  );
  ok(
    "an unknown module is rejected",
    (
      await call("/api/v1/rbac/matrix", {
        method: "PUT",
        token: tokens("dealerOwner"),
        body: { hacking: { viewer: true } },
      })
    ).status === 400
  );

  // B7. viewers are strictly read-only, over the API
  const viewerMe = await call("/api/v1/auth/me", { token: tokens("viewer") });
  ok(
    "the viewer holds only read permissions",
    Object.keys(viewerMe.json.permissions).length > 0 &&
      Object.keys(viewerMe.json.permissions).every((k) => k.endsWith(":read"))
  );

  // B8. team management by a manager (per the spec)
  const mgrInvite = await call("/api/v1/auth/invitations", {
    method: "POST",
    token: M,
    body: { email: `hire-${suffix}@example.com`, roleId: X.roles.salesperson },
  });
  ok("a manager can invite a salesperson (team management)", mgrInvite.status === 201);
  ok(
    "a manager can suspend a salesperson",
    (
      await call(`/api/v1/users/${X.users.salesperson.id}/status`, {
        method: "PATCH",
        token: M,
        body: { status: "suspended" },
      })
    ).status === 200
  );
  ok(
    "...and re-activate them",
    (
      await call(`/api/v1/users/${X.users.salesperson.id}/status`, {
        method: "PATCH",
        token: M,
        body: { status: "active" },
      })
    ).status === 200
  );
  // suspension correctly revoked the salesperson's session; sign them in again for the remaining scenarios
  X.users.salesperson.token = (
    await createSession(db, { organizationId: X.org.id, userId: X.users.salesperson.id })
  ).token;
  ok(
    "a manager cannot suspend the owner",
    (
      await call(`/api/v1/users/${X.users.dealerOwner.id}/status`, {
        method: "PATCH",
        token: M,
        body: { status: "suspended" },
      })
    ).json.code === "role_rank_exceeded"
  );
  ok(
    "a salesperson has no team management",
    (
      await call("/api/v1/auth/invitations", {
        method: "POST",
        token: tokens("salesperson"),
        body: { email: `n-${suffix}@example.com`, roleId: X.roles.viewer },
      })
    ).status === 403
  );

  // B9. scope enforcement: a role limited to its own branch
  const branchRole = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: tokens("dealerOwner"),
    body: { name: "Branch Staff", rank: 20, permissions: [{ permission: "branches:read", scope: "branch" }] },
  });
  const branchUser = await X.mkUser("branchstaff", branchRole.json.id, [X.branches[0].id]);
  const seen = await call("/api/v1/branches", { token: branchUser.token });
  ok(
    "a branch-scoped role lists ONLY its assigned branch",
    seen.status === 200 && seen.json.length === 1 && seen.json[0].id === X.branches[0].id
  );
  ok(
    "...and gets 404 (not 403) for another branch of the same organization",
    (await call(`/api/v1/branches/${X.branches[1].id}`, { token: branchUser.token })).status === 404
  );
  ok(
    "...but can open its own branch",
    (await call(`/api/v1/branches/${X.branches[0].id}`, { token: branchUser.token })).status === 200
  );
  const ownerSees = await call("/api/v1/branches", { token: tokens("dealerOwner") });
  ok("an organization-scoped role sees every branch", ownerSees.json.length === 2);
  const ownRole = await call("/api/v1/rbac/roles", {
    method: "POST",
    token: tokens("dealerOwner"),
    body: { name: "Own Scope", rank: 20, permissions: [{ permission: "branches:read", scope: "own" }] },
  });
  const ownUser = await X.mkUser("ownscope", ownRole.json.id);
  ok(
    "a role with no assigned branch and a narrow scope sees nothing (fail closed)",
    (await call("/api/v1/branches", { token: ownUser.token })).json.length === 0
  );

  // B10. denials are audited (and cannot flood the log)
  const denied = await call("/api/v1/rbac/roles", { token: tokens("salesperson") });
  const sales = X.users.salesperson.id;
  const row = await db.auditLog.findFirst({
    where: { actorUserId: sales, action: "authz.denied", metadata: { path: ["permission"], equals: "roles:read" } },
  });
  ok(
    "a refused request is written to the audit log",
    denied.status === 403 && !!row && row.outcome === "DENIED" && row.organizationId === X.org.id
  );
  const flood: number[] = [];
  for (let i = 0; i < 40; i++) flood.push((await call("/api/v1/rbac/roles", { token: tokens("salesperson") })).status);
  ok(
    "hammering a forbidden endpoint always returns 403",
    flood.every((s) => s === 403)
  );
  ok(
    "...but cannot flood the audit log (capped per user per hour)",
    (await db.auditLog.count({ where: { actorUserId: sales, action: "authz.denied" } })) <= 30
  );

  // B11. cross-tenant
  const yRole = Y.roles.viewer;
  ok(
    "another organization's role -> 404 (read)",
    (await call(`/api/v1/rbac/roles/${yRole}`, { token: tokens("dealerOwner") })).status === 404
  );
  ok(
    "another organization's role -> 404 (edit permissions)",
    (
      await call(`/api/v1/rbac/roles/${yRole}/permissions`, {
        method: "PUT",
        token: tokens("dealerOwner"),
        body: { permissions: [] },
      })
    ).status === 404
  );
  ok(
    "another organization's role -> 404 (delete)",
    (await call(`/api/v1/rbac/roles/${yRole}`, { method: "DELETE", token: tokens("dealerOwner") })).status === 404
  );
  ok(
    "role lists never mix organizations",
    (await call("/api/v1/rbac/roles", { token: tokens("dealerOwner") })).json.every(
      (r: { id: string }) => !Object.values(Y.roles).includes(r.id)
    )
  );
  const yRoleUntouched = await db.rolePermission.count({ where: { roleId: yRole } });
  ok("the other organization's role was not modified by any of this", yRoleUntouched > 0);
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, sortDeep(x)])
    );
  }
  return v;
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nRBAC HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`RBAC HTTP check OK: ${passed} assertions passed.`);
  });
