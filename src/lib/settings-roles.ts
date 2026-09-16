export const roleKeys = [
  "superAdmin",
  "dealerOwner",
  "manager",
  "salesperson",
  "buyer",
  "accountant",
  "marketingManager",
  "viewer",
] as const;

export type RoleKey = (typeof roleKeys)[number];

export const fullAccessRoles: RoleKey[] = ["superAdmin", "dealerOwner"];

export const moduleKeys = [
  "inventory",
  "purchasing",
  "leads",
  "deals",
  "documents",
  "billing",
  "marketing",
  "reports",
  "settings",
  "aiActivity",
] as const;

export type ModuleKey = (typeof moduleKeys)[number];

export type PermissionMatrix = Record<ModuleKey, Record<RoleKey, boolean>>;
