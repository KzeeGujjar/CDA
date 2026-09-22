/**
 * End-to-end tenant-isolation check over real HTTP. Run with `npm run check:tenancy` against a
 * RUNNING app (`next start`) whose DATABASE_URL is the restricted `cda_app` role, on a THROWAWAY
 * database that has been migrated + seeded (it writes test tenants).
 *
 *   CHECK_DB_ALLOW_WRITES=1 CHECK_BASE_URL=http://localhost:3100 DIRECT_DATABASE_URL=... npm run check:tenancy
 *
 * It creates two dealerships (A, B) plus a suspended dealership, logs users in by minting sessions
 * directly, then attacks the API as tenant A trying to reach tenant B in every way we can think of.
 */
import { createPrismaClient } from "@/server/db/client";
import { createSession, revokeSession } from "@/server/auth/session";
import { sessionCookieName } from "@/server/auth/cookies";
import { PLATFORM_ORGANIZATION_ID } from "@/server/auth/constants";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const url = process.env.DIRECT_DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL (owner connection, for test setup only).");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";

const db = createPrismaClient(url, { maxConnections: 2 });
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

async function call(
  path: string,
  init: { token?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.token) headers.cookie = `${sessionCookieName()}=${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  // Test-only: response shapes are asserted field by field below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any, headers: res.headers };
}

async function makeTenant(label: string, suffix: string, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const org = await db.organization.create({
    data: { name: `${label} Motors ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com`, status },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const mkUser = (name: string, roleId: string, userStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE") =>
    db.user.create({
      data: {
        organizationId: org.id,
        roleId,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}-${label.toLowerCase()}-${suffix}@example.com`,
        status: userStatus,
      },
    });
  const owner = await mkUser(`${label} Owner`, roles.dealerOwner);
  const branch = await db.branch.create({ data: { organizationId: org.id, name: `${label}-Main`, isPrimary: true } });
  const login = async (userId: string) => (await createSession(db, { organizationId: org.id, userId })).token;
  return { org, roles, owner, branch, mkUser, login };
}

async function main() {
  const suffix = Date.now().toString(36);
  const A = await makeTenant("Alpha", suffix);
  const B = await makeTenant("Bravo", suffix);
  const S = await makeTenant("Sleepy", suffix, "SUSPENDED");

  const tokenA = await A.login(A.owner.id);
  const tokenB = await B.login(B.owner.id);
  const salesA = await A.mkUser("Alpha Sales", A.roles.salesperson);
  const tokenSalesA = await A.login(salesA.id);
  const suspendedUser = await A.mkUser("Alpha Suspended", A.roles.viewer, "SUSPENDED");
  const tokenSuspendedUser = await A.login(suspendedUser.id);
  const tokenSuspendedOrg = await S.login(S.owner.id);
  const superRole = await db.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId: PLATFORM_ORGANIZATION_ID, key: "superAdmin" } },
  });
  const staff = await db.user.create({
    data: {
      organizationId: PLATFORM_ORGANIZATION_ID,
      roleId: superRole.id,
      name: "Platform Staff",
      email: `staff-${suffix}@example.com`,
      status: "ACTIVE",
    },
  });
  const tokenStaff = (await createSession(db, { organizationId: PLATFORM_ORGANIZATION_ID, userId: staff.id })).token;

  // ── authentication
  ok("no cookie -> 401", (await call("/api/v1/branches")).status === 401);
  ok("garbage cookie -> 401", (await call("/api/v1/branches", { token: "x".repeat(43) })).status === 401);
  const expired = await createSession(db, { organizationId: A.org.id, userId: A.owner.id });
  await db.session.update({
    where: { id: expired.sessionId },
    data: { createdAt: new Date(Date.now() - 7200_000), expiresAt: new Date(Date.now() - 3600_000) },
  });
  ok("expired session -> 401", (await call("/api/v1/branches", { token: expired.token })).status === 401);
  const revoked = await createSession(db, { organizationId: A.org.id, userId: A.owner.id });
  ok("session works before revoke", (await call("/api/v1/branches", { token: revoked.token })).status === 200);
  await revokeSession(db, revoked.sessionId);
  ok("revoked session -> 401 immediately", (await call("/api/v1/branches", { token: revoked.token })).status === 401);
  ok("suspended user -> 401", (await call("/api/v1/branches", { token: tokenSuspendedUser })).status === 401);
  ok(
    "user of suspended organization -> 401",
    (await call("/api/v1/branches", { token: tokenSuspendedOrg })).status === 401
  );

  // ── identity comes from the session
  const meA = await call("/api/v1/auth/me", { token: tokenA });
  ok(
    "/auth/me returns tenant A's identity",
    meA.status === 200 && meA.json.organization.id === A.org.id && meA.json.user.id === A.owner.id
  );
  const meB = await call("/api/v1/auth/me", { token: tokenB });
  ok("/auth/me returns tenant B's identity to B", meB.json.organization.id === B.org.id);
  ok(
    "/auth/me ignores a spoofed organization header",
    (
      await call("/api/v1/auth/me", {
        token: tokenA,
        headers: { "x-organization-id": B.org.id, "x-tenant-id": B.org.id },
      })
    ).json.organization.id === A.org.id
  );

  // ── reads are confined to the caller's tenant
  const listA = await call("/api/v1/branches", { token: tokenA });
  ok(
    "A lists only its own branches",
    listA.status === 200 && listA.json.length === 1 && listA.json[0].id === A.branch.id
  );
  ok("branch DTO does not expose organizationId", !("organizationId" in listA.json[0]));
  ok(
    "header spoofing does not change the result",
    (await call("/api/v1/branches", { token: tokenA, headers: { "x-organization-id": B.org.id } })).json[0].id ===
      A.branch.id
  );
  const crossBranch = await call(`/api/v1/branches/${B.branch.id}`, { token: tokenA });
  ok(
    "A reading B's branch by id -> 404 (existence not revealed)",
    crossBranch.status === 404,
    `got ${crossBranch.status}`
  );
  ok(
    "A reading its own branch -> 200",
    (await call(`/api/v1/branches/${A.branch.id}`, { token: tokenA })).status === 200
  );
  const usersA = await call("/api/v1/users", { token: tokenA });
  ok(
    "A lists only its own users",
    usersA.status === 200 &&
      usersA.json.every((u: { email: string }) => u.email.includes(`-alpha-${suffix}`)) &&
      usersA.json.length >= 3
  );
  ok(
    "user DTO never contains password hash or lockout data",
    usersA.json.every((u: object) => !("passwordHash" in u) && !("lockedUntil" in u) && !("organizationId" in u))
  );
  ok("A reading B's user by id -> 404", (await call(`/api/v1/users/${B.owner.id}`, { token: tokenA })).status === 404);

  // ── client-supplied tenant identifiers are rejected everywhere
  for (const key of ["organizationId", "organization_id", "dealershipId", "tenantId", "orgId"]) {
    const r = await call(`/api/v1/branches?${key}=${B.org.id}`, { token: tokenA });
    ok(
      `query ?${key}= is rejected`,
      r.status === 400 && r.json.code === "tenant_field_not_allowed",
      `got ${r.status} ${r.json?.code}`
    );
  }
  const injectTop = await call("/api/v1/branches", {
    token: tokenA,
    method: "POST",
    body: { name: "Injected", organizationId: B.org.id },
  });
  ok("body organizationId is rejected", injectTop.status === 400 && injectTop.json.code === "tenant_field_not_allowed");
  const injectNested = await call("/api/v1/branches", {
    token: tokenA,
    method: "POST",
    body: { name: "InjectedNested", extra: [{ deep: { tenant_id: B.org.id } }] },
  });
  ok(
    "nested tenant key is rejected",
    injectNested.status === 400 && injectNested.json.code === "tenant_field_not_allowed"
  );
  const injectSame = await call("/api/v1/branches", {
    token: tokenA,
    method: "POST",
    body: { name: "InjectedSame", organizationId: A.org.id },
  });
  ok("even the caller's OWN organizationId is rejected (clients never send it)", injectSame.status === 400);
  ok(
    "nothing was created by rejected requests",
    (await db.branch.count({ where: { name: { startsWith: "Injected" } } })) === 0
  );
  const unknownField = await call("/api/v1/branches", {
    token: tokenA,
    method: "POST",
    body: { name: "X1", isAdmin: true },
  });
  ok(
    "unknown fields are rejected by the strict schema",
    unknownField.status === 400 && unknownField.json.code === "validation_error"
  );

  // ── writes land in the caller's tenant only
  const created = await call("/api/v1/branches", {
    token: tokenA,
    method: "POST",
    body: { name: "Alpha-Second", emirate: "dubai" },
  });
  ok("A creates a branch -> 201", created.status === 201 && created.json.name === "Alpha-Second");
  const row = await db.branch.findUnique({ where: { id: created.json.id } });
  ok("the new branch belongs to A's organization", row?.organizationId === A.org.id);
  const audit = await db.auditLog.findFirst({ where: { action: "branch.created", entityId: created.json.id } });
  ok(
    "the write was audited in A's organization with the actor",
    audit?.organizationId === A.org.id && audit?.actorUserId === A.owner.id
  );
  ok("B still sees only its own branch", (await call("/api/v1/branches", { token: tokenB })).json.length === 1);
  ok(
    "duplicate branch name -> 409",
    (await call("/api/v1/branches", { token: tokenA, method: "POST", body: { name: "Alpha-Second" } })).status === 409
  );
  ok(
    "the same branch name is allowed in ANOTHER tenant",
    (await call("/api/v1/branches", { token: tokenB, method: "POST", body: { name: "Alpha-Second" } })).status === 201
  );
  const crossOrigin = await call("/api/v1/branches", {
    token: tokenA,
    method: "POST",
    body: { name: "Csrf" },
    headers: { origin: "https://evil.example" },
  });
  ok("cross-site write is blocked", crossOrigin.status === 403);

  // ── permissions (role-based, per resource/action) and immediate effect of role edits
  ok("salesperson can read branches", (await call("/api/v1/branches", { token: tokenSalesA })).status === 200);
  ok(
    "salesperson cannot create branches -> 403",
    (await call("/api/v1/branches", { token: tokenSalesA, method: "POST", body: { name: "Nope" } })).status === 403
  );
  const rp = await db.rolePermission.findFirstOrThrow({
    where: { roleId: A.roles.salesperson, permission: { key: "branches:read" } },
  });
  await db.rolePermission.delete({
    where: { roleId_permissionId: { roleId: rp.roleId, permissionId: rp.permissionId } },
  });
  ok(
    "revoking a permission takes effect on the next request",
    (await call("/api/v1/branches", { token: tokenSalesA })).status === 403
  );

  // ── platform staff are NOT a tenant back door
  const staffList = await call("/api/v1/branches", { token: tokenStaff });
  ok(
    "Super Admin through the tenant API sees no dealership's data",
    staffList.status === 200 && staffList.json.length === 0
  );
  ok(
    "Super Admin cannot read a dealership's branch by id",
    (await call(`/api/v1/branches/${A.branch.id}`, { token: tokenStaff })).status === 404
  );

  // ── no leakage between concurrent requests sharing the connection pool
  const jobs = Array.from({ length: 60 }, (_, i) => {
    const isA = i % 2 === 0;
    return call("/api/v1/branches", { token: isA ? tokenA : tokenB }).then((r) => ({ isA, r }));
  });
  const results = await Promise.all(jobs);
  const leaked = results.filter(
    ({ isA, r }) =>
      r.status !== 200 ||
      r.json.some((b: { name: string }) => (isA ? b.name.startsWith("Bravo") : b.name === "Alpha-Main"))
  );
  ok(
    "60 interleaved requests from two tenants never see each other's rows",
    leaked.length === 0,
    `${leaked.length} leaked`
  );

  // ── error responses do not leak internals
  const notFound = await call("/api/v1/branches/does-not-exist", { token: tokenA });
  ok(
    "not-found body has no stack/SQL",
    notFound.status === 404 && !JSON.stringify(notFound.json).match(/prisma|select|stack|at \w+/i)
  );
  ok(
    "responses are not cacheable",
    (await call("/api/v1/branches", { token: tokenA })).headers.get("cache-control") === "no-store"
  );
  ok(
    "a hostile request id is not echoed",
    (
      await call("/api/v1/branches", {
        token: tokenA,
        headers: { "x-request-id": "evil id; <script>alert(1)</script>" },
      })
    ).headers.get("x-request-id") !== "evil id; <script>alert(1)</script>"
  );
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nTenancy HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Tenancy HTTP check OK: ${passed} assertions passed.`);
  });
