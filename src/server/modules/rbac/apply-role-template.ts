import type { Prisma } from "@/generated/prisma/client";
import { permissionCatalog, permissionKey, type PermissionAction } from "@/server/auth/permission-catalog";
import { roleTemplates, tenantRoleKeys, type RoleTemplate } from "@/server/auth/role-templates";
import type { RoleKey } from "@/lib/settings-roles";

type Tx = Prisma.TransactionClient;

/** permission key ("vehicles:read") → permissions.id, from the seeded catalog. */
export async function loadPermissionIds(tx: Tx): Promise<Map<string, string>> {
  const rows = await tx.permission.findMany({ select: { id: true, key: true } });
  return new Map(rows.map((r) => [r.key, r.id]));
}

/**
 * Creates (or RESETS) one role in `organizationId` from its template, replacing its permission set.
 * Resetting overwrites tenant customisations, so only call it for a brand-new organization or an
 * explicit "restore defaults" action.
 */
export async function applyRoleTemplate(
  tx: Tx,
  organizationId: string,
  template: RoleTemplate,
  permissionIds: Map<string, string>
): Promise<string> {
  const role = await tx.role.upsert({
    where: { organizationId_key: { organizationId, key: template.key } },
    create: {
      organizationId,
      key: template.key,
      name: template.name,
      description: template.description,
      isSystem: true,
      rank: template.rank,
    },
    update: { name: template.name, description: template.description, rank: template.rank },
    select: { id: true },
  });

  const rows: Prisma.RolePermissionCreateManyInput[] = [];
  for (const [resource, grant] of Object.entries(template.grants)) {
    if (!grant) continue;
    const allowed = permissionCatalog[resource as keyof typeof permissionCatalog] as readonly PermissionAction[];
    for (const action of grant.actions) {
      if (!allowed.includes(action)) {
        throw new Error(
          `Template "${template.key}" grants "${action}" on "${resource}", which the catalog does not define.`
        );
      }
      const key = permissionKey(resource as keyof typeof permissionCatalog, action);
      const permissionId = permissionIds.get(key);
      if (!permissionId) throw new Error(`Permission "${key}" is not seeded. Run the seed first.`);
      rows.push({
        roleId: role.id,
        permissionId,
        organizationId,
        scope: (grant.scope ?? "organization").toUpperCase() as "OWN" | "BRANCH" | "ORGANIZATION",
      });
    }
  }

  await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
  await tx.rolePermission.createMany({ data: rows });
  return role.id;
}

/**
 * Gives a new tenant its 7 built-in roles (everything except Super Admin) with default permissions.
 * Returns role key → role id, e.g. to assign the founding user the `dealerOwner` role.
 */
export async function provisionOrganizationRoles(tx: Tx, organizationId: string): Promise<Record<RoleKey, string>> {
  const permissionIds = await loadPermissionIds(tx);
  const ids: Partial<Record<RoleKey, string>> = {};
  for (const key of tenantRoleKeys) {
    ids[key] = await applyRoleTemplate(tx, organizationId, roleTemplates[key], permissionIds);
  }
  return ids as Record<RoleKey, string>;
}
