import type { RoleKey } from "@/lib/settings-roles";
import type { PermissionScope } from "./permission-catalog";

/**
 * Who is calling, and which organization they act in. Built ONLY by resolveSessionContext() from a
 * server-side session record. Nothing in a request body, query string or header can set or change it.
 */
export interface AuthContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail: string;
  readonly roleId: string;
  readonly roleKey: string;
  readonly roleRank: number;
  readonly sessionId: string;
  readonly branchIds: readonly string[];
  /** permission key ("vehicles:read") -> widest scope granted */
  readonly permissions: ReadonlyMap<string, PermissionScope>;
  /** Only meaningful for built-in roles; custom roles carry their own key. */
  readonly builtInRole?: RoleKey;
}
