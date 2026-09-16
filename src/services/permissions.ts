import type { ModuleKey, PermissionMatrix, RoleKey } from "@/lib/settings-roles";
import { fullAccessRoles } from "@/lib/settings-roles";
import { rolePermissionsFixture } from "@/mock/role-permissions";

let matrix: PermissionMatrix = { ...rolePermissionsFixture };

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getRolePermissions(): Promise<PermissionMatrix> {
  await wait();
  return matrix;
}

export async function updateRolePermissions(next: PermissionMatrix): Promise<PermissionMatrix> {
  await wait(200);
  matrix = next;
  return matrix;
}

export function roleCanAccessModule(matrixSnapshot: PermissionMatrix, role: RoleKey, module: ModuleKey): boolean {
  if (fullAccessRoles.includes(role)) return true;
  return Boolean(matrixSnapshot[module]?.[role]);
}
