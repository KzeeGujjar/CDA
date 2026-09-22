import { createPrismaClient } from "@/server/db/client";
import { allPermissions } from "@/server/auth/permission-catalog";
import { roleTemplates } from "@/server/auth/role-templates";
import { PLATFORM_ORGANIZATION_ID } from "@/server/auth/constants";
import { applyRoleTemplate, loadPermissionIds } from "@/server/modules/rbac/apply-role-template";

// The seed writes the global permission catalog, so it must run as the database OWNER
// (DIRECT_DATABASE_URL), never as the RLS-restricted `cda_app` role.
try {
  process.loadEnvFile(".env");
} catch {
  // real environment variables are provided by CI / the host
}

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL (or DATABASE_URL) before seeding.");

const prisma = createPrismaClient(url);

async function main() {
  // 1. Permission catalog — idempotent upsert; report (don't delete) keys no longer in code.
  for (const p of allPermissions) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, resource: p.resource, action: p.action.toUpperCase() as never, description: p.description },
      update: { description: p.description },
    });
  }
  const known = new Set(allPermissions.map((p) => p.key));
  const stale = (await prisma.permission.findMany({ select: { key: true } }))
    .map((p) => p.key)
    .filter((k) => !known.has(k));
  if (stale.length)
    console.warn(`Permissions in the database but not in the catalog (left in place): ${stale.join(", ")}`);

  // 2. The platform organization + Super Admin role (platform staff live here).
  await prisma.organization.upsert({
    where: { id: PLATFORM_ORGANIZATION_ID },
    create: {
      id: PLATFORM_ORGANIZATION_ID,
      type: "PLATFORM",
      name: "CDA Platform",
      email: "platform@cda.invalid",
    },
    update: {},
  });

  await prisma.$transaction(async (tx) => {
    const permissionIds = await loadPermissionIds(tx);
    await applyRoleTemplate(tx, PLATFORM_ORGANIZATION_ID, roleTemplates.superAdmin, permissionIds);
  });

  console.log(`Seeded ${allPermissions.length} permissions, the platform organization, and the Super Admin role.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
