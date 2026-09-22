/**
 * The complete list of things a role can be allowed to do: one entry per (resource, action).
 * This file is the single source of truth — `prisma/seed.ts` upserts it into the `permissions`
 * table, and role templates may only grant what is listed here.
 *
 * Adding a resource or action = edit this file, run the seed. No migration needed.
 */

export const permissionActions = ["read", "create", "update", "delete", "export", "manage"] as const;
export type PermissionAction = (typeof permissionActions)[number];

/** Narrowest → widest. */
export const permissionScopes = ["own", "branch", "organization"] as const;
export type PermissionScope = (typeof permissionScopes)[number];

const CRUD = ["read", "create", "update", "delete"] as const;
const CRUD_EXPORT = ["read", "create", "update", "delete", "export"] as const;

export const permissionCatalog = {
  // Inventory & purchasing
  vehicles: CRUD_EXPORT,
  purchases: CRUD_EXPORT,
  suppliers: CRUD,
  // Sales & CRM
  customers: CRUD_EXPORT,
  leads: CRUD_EXPORT,
  deals: CRUD_EXPORT,
  sales: ["read", "create", "update", "export"],
  // Money
  profit: ["read", "create"], // cost ledger, margins, profit calculator — sensitive
  billing: ["read", "manage"],
  // Documents & contracts
  documents: CRUD_EXPORT,
  // Operations
  tasks: CRUD,
  messages: ["read", "create", "update"],
  notifications: ["read", "update"],
  // Intelligence & AI
  valuations: ["read", "create"],
  market_intelligence: ["read"],
  marketing: CRUD,
  ai_agent: ["read", "create"],
  ai_activity: ["read", "update"],
  reports: ["read", "export"],
  // Administration
  users: CRUD,
  roles: ["read", "manage"],
  organization: ["read", "update"],
  branches: CRUD,
  settings: ["read", "update"],
  integrations: ["read", "manage"],
  api_keys: ["read", "create", "delete"],
  audit_logs: ["read", "export"],
  // Cross-tenant platform administration (Super Admin only, via the platform client)
  platform: ["manage"],
} as const satisfies Record<string, readonly PermissionAction[]>;

export type PermissionResource = keyof typeof permissionCatalog;

export const permissionResources = Object.keys(permissionCatalog) as PermissionResource[];

export function permissionKey(resource: PermissionResource, action: PermissionAction): string {
  return `${resource}:${action}`;
}

export interface CatalogPermission {
  key: string;
  resource: PermissionResource;
  action: PermissionAction;
  description: string;
}

export const allPermissions: CatalogPermission[] = permissionResources.flatMap((resource) =>
  (permissionCatalog[resource] as readonly PermissionAction[]).map((action) => ({
    key: permissionKey(resource, action),
    resource,
    action,
    description: `${action} ${resource.replace(/_/g, " ")}`,
  }))
);
