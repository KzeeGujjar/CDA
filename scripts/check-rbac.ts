/**
 * Regression guard for the role/permission model. Run with `npm run check:rbac`.
 *  1. Every template grant exists in the permission catalog.
 *  2. Each role's default module access equals the frontend's permission matrix fixture, so the
 *     real RBAC cannot silently drift from what the UI already shows.
 *  3. Owner/Super Admin hold every permission (Super Admin alone holds `platform:manage`).
 */
import { roleKeys, moduleKeys } from "@/lib/settings-roles";
import { rolePermissionsFixture } from "@/mock/role-permissions";
import { allPermissions, permissionCatalog, type PermissionAction } from "@/server/auth/permission-catalog";
import { roleTemplates, templateCanAccessModule } from "@/server/auth/role-templates";
import { holdsAtLeast, scopeAllows, scopeWhere } from "@/server/auth/authorize";

const errors: string[] = [];

const keys = allPermissions.map((p) => p.key);
if (new Set(keys).size !== keys.length) errors.push("Duplicate permission keys in the catalog.");

for (const role of roleKeys) {
  for (const [resource, grant] of Object.entries(roleTemplates[role].grants)) {
    const defined = permissionCatalog[resource as keyof typeof permissionCatalog] as
      readonly PermissionAction[] | undefined;
    if (!defined) {
      errors.push(`${role}: unknown resource "${resource}"`);
      continue;
    }
    for (const action of grant?.actions ?? []) {
      if (!defined.includes(action)) errors.push(`${role}: "${action}" is not a defined action on "${resource}"`);
    }
  }
}

for (const mod of moduleKeys) {
  for (const role of roleKeys) {
    const expected = rolePermissionsFixture[mod][role];
    const actual = templateCanAccessModule(role, mod);
    if (expected !== actual) {
      errors.push(`module "${mod}" / role "${role}": frontend matrix says ${expected}, template says ${actual}`);
    }
  }
}

const count = (role: (typeof roleKeys)[number]) =>
  Object.values(roleTemplates[role].grants).reduce((n, g) => n + (g?.actions.length ?? 0), 0);
if (count("superAdmin") !== allPermissions.length) errors.push("superAdmin must hold every permission.");
if (count("dealerOwner") !== allPermissions.length - 1)
  errors.push("dealerOwner must hold every permission except platform:manage.");
if (roleTemplates.dealerOwner.grants.platform) errors.push("dealerOwner must not hold platform:manage.");

// ── the role definitions from the product spec, encoded as assertions
type Role = (typeof roleKeys)[number];
const grantMap = (role: Role) => {
  const m = new Map<string, string>();
  for (const [resource, g] of Object.entries(roleTemplates[role].grants)) {
    for (const a of g?.actions ?? []) m.set(`${resource}:${a}`, g?.scope ?? "organization");
  }
  return m;
};
const expectHas = (role: Role, keys: string[], scope?: string) => {
  const g = grantMap(role);
  for (const k of keys) {
    if (!g.has(k)) errors.push(`${role} must hold ${k}`);
    else if (scope && g.get(k) !== scope) errors.push(`${role} must hold ${k} at scope "${scope}" (has "${g.get(k)}")`);
  }
};
const expectLacks = (role: Role, keys: string[]) => {
  const g = grantMap(role);
  for (const k of keys) if (g.has(k)) errors.push(`${role} must NOT hold ${k}`);
};

// Dealer Owner: full dealership access (everything except platform administration)
expectHas(
  "dealerOwner",
  allPermissions.filter((p) => p.key !== "platform:manage").map((p) => p.key)
);
expectLacks("dealerOwner", ["platform:manage"]);

// Manager: vehicles, inventory, leads, customers, deals, reports, team management according to permissions
const crud = (r: string) => ["read", "create", "update", "delete"].map((a) => `${r}:${a}`);
for (const r of ["vehicles", "leads", "customers", "deals"]) expectHas("manager", crud(r));
expectHas("manager", [
  "reports:read",
  "reports:export",
  "users:read",
  "users:create",
  "users:update",
  "roles:read",
  "purchases:read",
]);
expectLacks("manager", [
  "users:delete",
  "roles:manage",
  "billing:read",
  "billing:manage",
  "settings:read",
  "settings:update",
  "api_keys:read",
  "audit_logs:read",
  "platform:manage",
]);

// Salesperson: ASSIGNED leads (own scope), customers, deals, vehicles, tasks
expectHas(
  "salesperson",
  [
    "leads:read",
    "leads:create",
    "leads:update",
    "deals:read",
    "deals:create",
    "deals:update",
    "tasks:read",
    "tasks:create",
    "tasks:update",
    "tasks:delete",
  ],
  "own"
);
expectHas("salesperson", ["customers:read", "customers:create", "customers:update"], "organization");
expectHas("salesperson", ["vehicles:read"]);
expectLacks("salesperson", [
  "vehicles:create",
  "vehicles:update",
  "vehicles:delete",
  "leads:delete",
  "customers:delete",
  "reports:read",
  "users:create",
  "users:update",
  "roles:manage",
  "billing:read",
  "profit:read",
  "purchases:read",
]);

// Buyer: purchasing, vehicle analysis, inventory acquisition
expectHas("buyer", [
  ...crud("purchases"),
  "purchases:export",
  "vehicles:read",
  "vehicles:create",
  "vehicles:update",
  "valuations:read",
  "valuations:create",
  "market_intelligence:read",
  "profit:read",
  ...crud("suppliers"),
]);
expectLacks("buyer", [
  "vehicles:delete",
  "leads:read",
  "customers:read",
  "deals:read",
  "billing:read",
  "reports:read",
  "users:create",
]);

// Accountant: financial information, deals, reports, documents
expectHas("accountant", [
  "profit:read",
  "billing:read",
  "billing:manage",
  "sales:read",
  "sales:export",
  "deals:read",
  "deals:export",
  "reports:read",
  "reports:export",
  "documents:read",
  "documents:export",
]);
expectLacks("accountant", [
  "deals:create",
  "deals:update",
  "deals:delete",
  "vehicles:read",
  "vehicles:update",
  "leads:read",
  "users:create",
  "roles:manage",
  "marketing:read",
]);

// Marketing Manager: marketing, advertisements, campaigns
expectHas("marketingManager", [...crud("marketing"), "reports:read", "ai_activity:read"]);
expectLacks("marketingManager", [
  "vehicles:update",
  "customers:read",
  "leads:read",
  "deals:read",
  "billing:read",
  "profit:read",
  "users:create",
  "roles:manage",
  "purchases:read",
]);

// Viewer: read-only access, strictly (no create / update / delete / export / manage anywhere)
for (const key of grantMap("viewer").keys()) {
  if (!key.endsWith(":read")) errors.push(`viewer must be read-only but holds ${key}`);
}
expectHas("viewer", ["vehicles:read", "reports:read"]);

// Sensitive capabilities are held only by the roles that should have them
const holders = (key: string) => roleKeys.filter((r) => grantMap(r).has(key));
const only = (key: string, allowed: Role[]) => {
  const extra = holders(key).filter((r) => !allowed.includes(r));
  if (extra.length) errors.push(`${key} is held by unexpected roles: ${extra.join(", ")}`);
};
only("roles:manage", ["superAdmin", "dealerOwner"]);
only("users:delete", ["superAdmin", "dealerOwner"]);
only("api_keys:create", ["superAdmin", "dealerOwner"]);
only("audit_logs:read", ["superAdmin", "dealerOwner"]);
only("settings:update", ["superAdmin", "dealerOwner"]);
only("billing:manage", ["superAdmin", "dealerOwner", "accountant"]);
only("platform:manage", ["superAdmin"]);

// ── scope helpers: they must only ever narrow
const ctx = {
  organizationId: "org1",
  userId: "u1",
  userName: "U",
  userEmail: "u@x",
  roleId: "r1",
  roleKey: "salesperson",
  roleRank: 40,
  sessionId: "s1",
  branchIds: ["b1", "b2"],
  permissions: new Map([
    ["leads:read", "own" as const],
    ["vehicles:read", "organization" as const],
  ]),
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
if (!eq(scopeWhere(ctx, "organization", { ownerField: "assignedToId" }), {}))
  errors.push("scopeWhere(organization) must be empty");
if (!eq(scopeWhere(ctx, "own", { ownerField: "assignedToId" }), { assignedToId: "u1" }))
  errors.push("scopeWhere(own) must filter by owner");
if (!eq(scopeWhere(ctx, "branch", { branchField: "branchId" }), { branchId: { in: ["b1", "b2"] } }))
  errors.push("scopeWhere(branch) must filter by branches");
if (!eq(scopeWhere(ctx, "own", { branchField: "branchId" }), { branchId: { in: ["b1", "b2"] } }))
  errors.push("scopeWhere(own) without an owner column must fall back to branch");
if (!eq(scopeWhere(ctx, "own", {}), { id: { in: [] } }))
  errors.push("scopeWhere(own) with no usable column must deny everything");
if (!eq(scopeWhere(ctx, "branch", { ownerField: "assignedToId" }), { id: { in: [] } }))
  errors.push("scopeWhere(branch) with no branch column must deny everything");
if (!scopeAllows(ctx, "own", { ownerField: "assignedToId" }, { assignedToId: "u1" }))
  errors.push("scopeAllows(own) must allow the owner");
if (scopeAllows(ctx, "own", { ownerField: "assignedToId" }, { assignedToId: "u2" }))
  errors.push("scopeAllows(own) must refuse another owner");
if (scopeAllows(ctx, "branch", { branchField: "branchId" }, { branchId: "b9" }))
  errors.push("scopeAllows(branch) must refuse another branch");
if (
  !holdsAtLeast(ctx, "vehicles:read", "own") ||
  holdsAtLeast(ctx, "leads:read", "organization") ||
  holdsAtLeast(ctx, "nope:read", "own")
) {
  errors.push("holdsAtLeast must compare scopes and deny unknown permissions");
}

if (errors.length) {
  console.error(`RBAC check failed:\n - ${errors.join("\n - ")}`);
  process.exit(1);
}
console.log(
  `RBAC OK: ${allPermissions.length} permissions, ${roleKeys.length} roles, ` +
    `${moduleKeys.length * roleKeys.length} module/role cells match the frontend matrix.`
);
