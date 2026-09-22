/**
 * Integration check for the database guarantees (tenant isolation, composite keys, constraints,
 * append-only audit log, role provisioning). Run with `npm run check:db` against a THROWAWAY
 * database that has had `prisma migrate deploy` + `prisma db seed` applied — it writes test rows.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... npm run check:db
 *
 * Set CHECK_DB_BOOTSTRAP_ROLE=1 to also create the `cda_app` role (only needed when the target
 * database does not already have it from prisma/sql/create-app-role.sql).
 */
import { readFileSync } from "node:fs";
import { Prisma } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db/client";
import { runInTenant } from "@/server/db/tenant";
import { TENANT_MODELS } from "@/server/db/tenant-extension";
import { allPermissions } from "@/server/auth/permission-catalog";
import { PLATFORM_ORGANIZATION_ID } from "@/server/auth/constants";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

if (process.env.CHECK_DB_ALLOW_WRITES !== "1") {
  throw new Error("Refusing to run: this check writes test data. Set CHECK_DB_ALLOW_WRITES=1 on a throwaway database.");
}
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL.");

const prisma = createPrismaClient(url, { maxConnections: 1 });
let passed = 0;
const failures: string[] = [];

function ok(name: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectRejects(name: string, pattern: RegExp, fn: () => Promise<unknown>) {
  try {
    await fn();
    failures.push(`${name} — expected an error but the statement succeeded`);
  } catch (error) {
    const text = String((error as Error).message) + String((error as { cause?: unknown }).cause ?? "");
    if (pattern.test(text)) passed++;
    else failures.push(`${name} — wrong error: ${text.slice(0, 220)}`);
    // The in-process PGlite test server drops the connection after any error; the pool needs one
    // throwaway query to reconnect. Harmless (and unnecessary) on a real PostgreSQL server.
    await prisma.$queryRaw`SELECT 1`.catch(() => undefined);
  }
}

/** Runs `fn` as the RLS-restricted app role, scoped to `orgId` (or unscoped when null). */
async function asApp<T>(
  orgId: string | null,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
    if (orgId) await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}

async function bootstrapRole() {
  const sql = readFileSync("prisma/sql/create-app-role.sql", "utf8")
    .replace(/:app_password/g, "'check-db-password'")
    .replace(/--.*$/gm, "");
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function main() {
  if (process.env.CHECK_DB_BOOTSTRAP_ROLE === "1") await bootstrapRole();

  // ── time zone: Prisma stores wall-clock UTC, so the database must be on UTC (migration database_timezone_utc)
  const tz = (await prisma.$queryRaw<{ TimeZone: string }[]>`SHOW timezone`)[0]?.TimeZone ?? "";
  ok("database TimeZone is UTC", /^(UTC|Etc\/UTC)$/i.test(tz), `it is "${tz}"`);
  const stored = await prisma.organization.create({
    data: {
      name: `TZ probe ${Date.now()}`,
      email: `tz-${Date.now()}@example.com`,
      createdAt: new Date("2026-03-10T12:00:00Z"),
    },
  });
  const [{ iso }] = await prisma.$queryRaw<{ iso: string }[]>`
    SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS iso FROM organizations WHERE id = ${stored.id}`;
  ok("a timestamp written by Prisma is stored as the same UTC instant", iso === "2026-03-10T12:00", `stored ${iso}`);

  // ── catalog & platform seed
  ok("permission catalog seeded", (await prisma.permission.count()) === allPermissions.length);
  const platform = await prisma.organization.findUnique({ where: { id: PLATFORM_ORGANIZATION_ID } });
  ok("platform organization exists", platform?.type === "PLATFORM");
  ok(
    "super admin role has every permission",
    (await prisma.rolePermission.count({ where: { organizationId: PLATFORM_ORGANIZATION_ID } })) ===
      allPermissions.length
  );

  // ── provisioning two tenants
  const suffix = Date.now().toString(36);
  const orgA = await prisma.organization.create({
    data: { name: `Test Motors A ${suffix}`, email: `owner-a-${suffix}@example.com`, emirate: "DUBAI" },
  });
  const orgB = await prisma.organization.create({
    data: { name: `Test Motors B ${suffix}`, email: `owner-b-${suffix}@example.com`, emirate: "DUBAI" },
  });
  const rolesA = await prisma.$transaction((tx) => provisionOrganizationRoles(tx, orgA.id));
  const rolesB = await prisma.$transaction((tx) => provisionOrganizationRoles(tx, orgB.id));
  ok(
    "7 tenant roles per organization",
    Object.keys(rolesA).length === 7 && (await prisma.role.count({ where: { organizationId: orgA.id } })) === 7
  );
  ok("tenant has no superAdmin role", !("superAdmin" in rolesA) || rolesA.superAdmin === undefined);
  ok(
    "owner holds all but platform:manage",
    (await prisma.rolePermission.count({ where: { roleId: rolesA.dealerOwner } })) === allPermissions.length - 1
  );
  const sp = await prisma.rolePermission.findFirst({
    where: { roleId: rolesA.salesperson, permission: { key: "leads:read" } },
  });
  ok("salesperson leads:read is scoped to OWN", sp?.scope === "OWN");
  const branchA = await prisma.branch.create({ data: { organizationId: orgA.id, name: "Downtown", isPrimary: true } });
  const branchB = await prisma.branch.create({ data: { organizationId: orgB.id, name: "Downtown" } });
  const userA = await prisma.user.create({
    data: {
      organizationId: orgA.id,
      roleId: rolesA.dealerOwner,
      name: "Owner A",
      email: `a-${suffix}@example.com`,
      status: "ACTIVE",
    },
  });
  const userB = await prisma.user.create({
    data: {
      organizationId: orgB.id,
      roleId: rolesB.dealerOwner,
      name: "Owner B",
      email: `b-${suffix}@example.com`,
      status: "ACTIVE",
    },
  });
  await prisma.userBranch.create({
    data: { userId: userA.id, branchId: branchA.id, organizationId: orgA.id, isPrimary: true },
  });

  // ── composite foreign keys: no cross-tenant references
  await expectRejects("user cannot take another tenant's role", /foreign key/i, () =>
    prisma.user.create({
      data: { organizationId: orgA.id, roleId: rolesB.viewer, name: "X", email: `x1-${suffix}@example.com` },
    })
  );
  await expectRejects("user cannot be linked to another tenant's branch", /foreign key/i, () =>
    prisma.userBranch.create({ data: { userId: userA.id, branchId: branchB.id, organizationId: orgA.id } })
  );
  const anyPermission = await prisma.permission.findFirstOrThrow();
  await expectRejects("role permission cannot cross tenants", /foreign key/i, () =>
    prisma.rolePermission.create({
      data: { roleId: rolesB.viewer, permissionId: anyPermission.id, organizationId: orgA.id },
    })
  );
  await expectRejects("invitation cannot use another tenant's role", /foreign key/i, () =>
    prisma.invitation.create({
      data: {
        organizationId: orgA.id,
        email: `i-${suffix}@example.com`,
        roleId: rolesB.viewer,
        invitedById: userA.id,
        tokenHash: `t1-${suffix}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    })
  );

  // ── constraints
  await expectRejects("email must be lowercase", /users_email_lowercase_chk|check constraint/i, () =>
    prisma.user.create({
      data: { organizationId: orgA.id, roleId: rolesA.viewer, name: "X", email: `UPPER-${suffix}@Example.com` },
    })
  );
  await expectRejects("email is globally unique", /unique/i, () =>
    prisma.user.create({
      data: { organizationId: orgB.id, roleId: rolesB.viewer, name: "X", email: `a-${suffix}@example.com` },
    })
  );
  await expectRejects("country must be 2 uppercase letters", /organizations_country_chk|check constraint/i, () =>
    prisma.organization.create({ data: { name: "Bad", email: `bad-${suffix}@example.com`, country: "ae" } })
  );
  await expectRejects("role name/key unique per organization", /unique/i, () =>
    prisma.role.create({ data: { organizationId: orgA.id, key: "manager", name: "Dup" } })
  );
  await expectRejects("session must expire after creation", /sessions_expiry_chk|check constraint/i, () =>
    prisma.session.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        tokenHash: `s-${suffix}`,
        expiresAt: new Date(Date.now() - 1000),
      },
    })
  );

  // ── audit log is append-only
  const audit = await prisma.auditLog.create({
    data: { organizationId: orgA.id, actorUserId: userA.id, action: "auth.login" },
  });
  ok("audit insert allowed", Boolean(audit.id));
  await expectRejects("audit UPDATE blocked", /append-only/i, () =>
    prisma.auditLog.update({ where: { id: audit.id }, data: { action: "x" } })
  );
  await expectRejects("audit DELETE blocked", /append-only/i, () =>
    prisma.auditLog.delete({ where: { id: audit.id } })
  );
  await expectRejects("audit TRUNCATE blocked", /append-only/i, () =>
    prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"')
  );

  // ── Row-Level Security as the restricted app role
  const usersSeenByA = await asApp(orgA.id, (tx) => tx.user.findMany({ select: { id: true, organizationId: true } }));
  ok("RLS: tenant A sees only its own users", usersSeenByA.length === 1 && usersSeenByA[0].organizationId === orgA.id);
  const rolesSeenByA = await asApp(orgA.id, (tx) => tx.role.findMany({ select: { organizationId: true } }));
  ok(
    "RLS: tenant A sees only its own roles",
    rolesSeenByA.length === 7 && rolesSeenByA.every((r) => r.organizationId === orgA.id)
  );
  const orgsSeenByA = await asApp(orgA.id, (tx) => tx.organization.findMany({ select: { id: true } }));
  ok("RLS: tenant A sees only its own organization row", orgsSeenByA.length === 1 && orgsSeenByA[0].id === orgA.id);
  const noTenant = await asApp(null, (tx) => tx.user.findMany());
  ok("RLS: no tenant set → zero rows (fail closed)", noTenant.length === 0);
  const auditSeen = await asApp(orgB.id, (tx) => tx.auditLog.findMany());
  ok("RLS: tenant B cannot read tenant A's audit log", auditSeen.length === 0);
  await expectRejects("RLS: cannot insert a row for another tenant", /row-level security/i, () =>
    asApp(orgA.id, (tx) => tx.branch.create({ data: { organizationId: orgB.id, name: "Injected" } }))
  );
  const crossUpdate = await asApp(orgA.id, (tx) =>
    tx.user.updateMany({ where: { id: userB.id }, data: { name: "Hacked" } })
  );
  ok("RLS: cannot update another tenant's row", crossUpdate.count === 0);
  const crossDelete = await asApp(orgA.id, (tx) => tx.branch.deleteMany({ where: { id: branchB.id } }));
  ok("RLS: cannot delete another tenant's row", crossDelete.count === 0);
  ok(
    "RLS: other tenant's data untouched",
    (await prisma.user.findUniqueOrThrow({ where: { id: userB.id } })).name === "Owner B"
  );

  // ── least privilege of the app role
  await expectRejects("app role cannot UPDATE audit_logs", /permission denied|append-only/i, () =>
    asApp(orgA.id, (tx) => tx.auditLog.updateMany({ data: { action: "x" } }))
  );
  await expectRejects("app role cannot modify the permission catalog", /permission denied/i, () =>
    asApp(orgA.id, (tx) => tx.permission.create({ data: { key: "evil:manage", resource: "evil", action: "MANAGE" } }))
  );
  ok(
    "app role can read the permission catalog",
    (await asApp(orgA.id, (tx) => tx.permission.count())) === allPermissions.length
  );

  // ── platform admin belongs to the platform organization and can be assigned Super Admin
  const superRole = await prisma.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId: PLATFORM_ORGANIZATION_ID, key: "superAdmin" } },
  });
  const staff = await prisma.user.create({
    data: {
      organizationId: PLATFORM_ORGANIZATION_ID,
      roleId: superRole.id,
      name: "Staff",
      email: `staff-${suffix}@example.com`,
      status: "ACTIVE",
    },
  });
  ok("platform staff can hold the Super Admin role", staff.roleId === superRole.id);

  // ── coverage: no tenant table can be forgotten
  const registered = new Set<string>(Object.values(TENANT_MODELS));
  const withOrgColumn = (
    await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'organization_id'`
  ).map((r) => r.table_name);
  ok(
    "TENANT_MODELS equals every table that has organization_id",
    withOrgColumn.length === registered.size && withOrgColumn.every((t) => registered.has(t)),
    `db has [${withOrgColumn.sort().join(", ")}]`
  );
  const protectedTables = [...registered, "organizations"];
  const rls = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT c.relname, c.relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (${Prisma.join(protectedTables)})`;
  ok(
    "RLS is enabled on every tenant table",
    rls.length === protectedTables.length && rls.every((r) => r.relrowsecurity)
  );
  const policies = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${Prisma.join(protectedTables)})`;
  ok("every tenant table has a policy", new Set(policies.map((p) => p.tablename)).size === protectedTables.length);

  // ── application-layer tenant extension (runs as the RLS-restricted role, so both layers are active)
  const inA = <T>(fn: Parameters<typeof runInTenant<T>>[2]) =>
    runInTenant(prisma, orgA.id, fn, { assumeRole: "cda_app" });
  await expectRejects("extension: cannot create with another tenant's organizationId", /Tenancy violation/, () =>
    inA((db) => db.branch.create({ data: { organizationId: orgB.id, name: "Injected2" } }))
  );
  const stamped = await inA((db) => db.branch.create({ data: { name: "Stamped" } as never }));
  ok("extension: create without organizationId is stamped with the tenant's", stamped.organizationId === orgA.id);
  const widened = await inA((db) => db.branch.findMany({ where: { organizationId: orgB.id } }));
  ok("extension: a caller-supplied organizationId cannot widen a query", widened.length === 0);
  ok(
    "extension: findUnique on another tenant's id returns null",
    (await inA((db) => db.branch.findUnique({ where: { id: branchB.id } }))) === null
  );
  await expectRejects(
    "extension: cannot update another tenant's row",
    /No record|not found|required but not found/i,
    () => inA((db) => db.branch.update({ where: { id: branchB.id }, data: { name: "Hacked" } }))
  );
  await expectRejects(
    "extension: cannot delete another tenant's row",
    /No record|not found|required but not found/i,
    () => inA((db) => db.branch.delete({ where: { id: branchB.id } }))
  );
  await expectRejects("extension: cannot move a record to another tenant", /Tenancy violation/, () =>
    inA((db) => db.branch.update({ where: { id: branchA.id }, data: { organizationId: orgB.id } }))
  );
  await expectRejects("extension: conflicting organizationId in a unique filter is refused", /Tenancy violation/, () =>
    inA((db) => db.role.findUnique({ where: { id: rolesA.viewer, organizationId: orgB.id } as never }))
  );
  await expectRejects("extension: permission catalog is read-only", /Tenancy violation/, () =>
    inA((db) => db.permission.create({ data: { key: "evil:manage", resource: "evil", action: "MANAGE" } }))
  );
  await expectRejects("extension: organizations cannot be created from a tenant context", /Tenancy violation/, () =>
    inA((db) => db.organization.create({ data: { name: "Rogue", email: `rogue-${suffix}@example.com` } }))
  );
  await expectRejects("extension: another organization row cannot be updated", /Tenancy violation/, () =>
    inA((db) => db.organization.update({ where: { id: orgB.id }, data: { name: "Hacked" } }))
  );
  ok(
    "extension: organization reads see only the tenant's own row",
    (await inA((db) => db.organization.findMany())).map((o) => o.id).join() === orgA.id
  );
  await expectRejects("extension: empty organization id is refused", /Tenancy violation/, () =>
    runInTenant(prisma, "", async () => undefined, { assumeRole: "cda_app" })
  );
  ok(
    "extension: other tenant's branch untouched after all attempts",
    (await prisma.branch.findUniqueOrThrow({ where: { id: branchB.id } })).name === "Downtown"
  );
}

main()
  .catch((error) => {
    failures.push(`unexpected error: ${(error as Error).stack ?? error}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (failures.length) {
      console.error(`\nDB check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
      process.exit(1);
    }
    console.log(`DB check OK: ${passed} assertions passed.`);
  });
