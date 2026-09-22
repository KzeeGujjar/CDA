import { roleKeys, type ModuleKey, type RoleKey } from "@/lib/settings-roles";
import {
  permissionCatalog,
  permissionResources,
  type PermissionAction,
  type PermissionResource,
  type PermissionScope,
} from "./permission-catalog";

/**
 * Default permissions for the 8 built-in roles. These are TEMPLATES: every new organization gets its own
 * editable copy (see modules/rbac/apply-role-template.ts). Changing a template never alters existing
 * tenants; only the Super Admin template is also stored, under the platform organization.
 */

export interface Grant {
  actions: readonly PermissionAction[];
  /** How far the grant reaches. Defaults to the whole organization. */
  scope?: PermissionScope;
}

export type Grants = Partial<Record<PermissionResource, Grant>>;

export interface RoleTemplate {
  key: RoleKey;
  name: string;
  description: string;
  /** Higher = more privileged. A user can only assign/grant roles ranked at or below their own. */
  rank: number;
  grants: Grants;
}

const R = ["read"] as const;
const RW = ["read", "create", "update"] as const;
const CRUD = ["read", "create", "update", "delete"] as const;
const CRUD_X = ["read", "create", "update", "delete", "export"] as const;
const READ_EXPORT = ["read", "export"] as const;

const grant = (actions: readonly PermissionAction[], scope?: PermissionScope): Grant => ({ actions, scope });

function everything(exclude: readonly PermissionResource[] = []): Grants {
  const out: Grants = {};
  for (const resource of permissionResources) {
    if (exclude.includes(resource)) continue;
    out[resource] = grant(permissionCatalog[resource]);
  }
  return out;
}

export const roleTemplates: Record<RoleKey, RoleTemplate> = {
  superAdmin: {
    key: "superAdmin",
    name: "Super Admin",
    description: "Platform staff. Full access, including cross-organization administration.",
    rank: 100,
    grants: everything(),
  },
  dealerOwner: {
    key: "dealerOwner",
    name: "Dealer Owner",
    description: "Owns the organization. Full access to everything inside it.",
    rank: 90,
    grants: everything(["platform"]),
  },
  manager: {
    key: "manager",
    name: "Manager",
    description:
      "Runs sales, inventory, purchasing and reports, and manages the team (invite, suspend). No billing or organization settings.",
    rank: 70,
    grants: {
      vehicles: grant(CRUD_X),
      purchases: grant(CRUD_X),
      suppliers: grant(CRUD),
      customers: grant(CRUD_X),
      leads: grant(CRUD_X),
      deals: grant(CRUD_X),
      sales: grant([...RW, "export"]),
      profit: grant(["read", "create"]),
      documents: grant(CRUD_X),
      tasks: grant(CRUD),
      messages: grant(RW),
      notifications: grant(["read", "update"]),
      valuations: grant(["read", "create"]),
      market_intelligence: grant(R),
      marketing: grant(CRUD),
      ai_agent: grant(["read", "create"]),
      ai_activity: grant(["read", "update"]),
      reports: grant(READ_EXPORT),
      // Team management "according to permissions": invite and suspend people at or below the manager rank.
      // No removal, no role editing (roles:manage), no organization settings.
      users: grant(RW),
      roles: grant(R),
      organization: grant(R),
      branches: grant(R),
      integrations: grant(R),
    },
  },
  salesperson: {
    key: "salesperson",
    name: "Salesperson",
    description: "Works their own leads, deals and tasks. Sees inventory and the shared customer list.",
    rank: 40,
    grants: {
      vehicles: grant(R),
      customers: grant(RW),
      leads: grant(RW, "own"),
      deals: grant(RW, "own"),
      sales: grant(R, "own"),
      documents: grant(RW, "own"),
      tasks: grant(CRUD, "own"),
      messages: grant(RW),
      notifications: grant(["read", "update"]),
      valuations: grant(["read", "create"]),
      market_intelligence: grant(R),
      ai_agent: grant(["read", "create"]),
      users: grant(R),
      organization: grant(R),
      branches: grant(R),
    },
  },
  buyer: {
    key: "buyer",
    name: "Buyer",
    description: "Purchasing staff. Sources, inspects and buys vehicles.",
    rank: 50,
    grants: {
      vehicles: grant(RW),
      purchases: grant(CRUD_X),
      suppliers: grant(CRUD),
      profit: grant(["read", "create"]),
      documents: grant(RW),
      tasks: grant(CRUD, "own"),
      notifications: grant(["read", "update"]),
      valuations: grant(["read", "create"]),
      market_intelligence: grant(R),
      ai_agent: grant(["read", "create"]),
      users: grant(R),
      organization: grant(R),
      branches: grant(R),
    },
  },
  accountant: {
    key: "accountant",
    name: "Accountant",
    description: "Finance view: deals, sales, documents, profit, billing and reports.",
    rank: 50,
    grants: {
      customers: grant(R),
      deals: grant(["read", "export"]),
      sales: grant(["read", "export"]),
      profit: grant(R),
      billing: grant(["read", "manage"]),
      documents: grant(["read", "export"]),
      notifications: grant(["read", "update"]),
      reports: grant(READ_EXPORT),
      organization: grant(R),
    },
  },
  marketingManager: {
    key: "marketingManager",
    name: "Marketing Manager",
    description: "Creates campaigns and AI marketing content; reviews AI activity.",
    rank: 50,
    grants: {
      marketing: grant(CRUD),
      notifications: grant(["read", "update"]),
      market_intelligence: grant(R),
      ai_agent: grant(["read", "create"]),
      ai_activity: grant(["read", "update"]),
      reports: grant(READ_EXPORT),
      organization: grant(R),
    },
  },
  viewer: {
    key: "viewer",
    name: "Viewer",
    description:
      "Read-only access to inventory and reports. Holds no create, update, delete, export or manage permission.",
    rank: 10,
    grants: {
      vehicles: grant(R),
      notifications: grant(R),
      reports: grant(R),
      organization: grant(R),
    },
  },
};

/**
 * The frontend's permission matrix is module-based (10 modules × 8 roles). A module is accessible
 * when the role holds `read` on the module's primary resource. `settings` and `billing` are the two
 * modules the UI currently gates with <RequirePermission>.
 */
export const moduleAccessResource: Record<ModuleKey, PermissionResource> = {
  inventory: "vehicles",
  purchasing: "purchases",
  leads: "leads",
  deals: "deals",
  documents: "documents",
  billing: "billing",
  marketing: "marketing",
  reports: "reports",
  settings: "settings",
  aiActivity: "ai_activity",
};

export function templateCanAccessModule(role: RoleKey, module: ModuleKey): boolean {
  return roleTemplates[role].grants[moduleAccessResource[module]]?.actions.includes("read") ?? false;
}

/** Roles created for a tenant. Super Admin is platform-only and never cloned into a tenant. */
export const tenantRoleKeys: RoleKey[] = roleKeys.filter((k) => k !== "superAdmin");
