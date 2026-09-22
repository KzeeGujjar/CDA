import { forbidden } from "@/server/lib/errors";
import type { AuthContext } from "./context";
import {
  permissionKey,
  type PermissionAction,
  type PermissionResource,
  type PermissionScope,
} from "./permission-catalog";

/** Widest scope the caller holds for resource:action, or null when not granted (deny by default). */
export function permissionScope(
  ctx: AuthContext,
  resource: PermissionResource,
  action: PermissionAction
): PermissionScope | null {
  return ctx.permissions.get(permissionKey(resource, action)) ?? null;
}

export function can(ctx: AuthContext, resource: PermissionResource, action: PermissionAction): boolean {
  return permissionScope(ctx, resource, action) !== null;
}

/** Throws 403 unless granted; returns the scope so the service can narrow its query (own / branch / organization). */
export function requirePermission(
  ctx: AuthContext,
  resource: PermissionResource,
  action: PermissionAction
): PermissionScope {
  const scope = permissionScope(ctx, resource, action);
  if (!scope) throw forbidden();
  return scope;
}

export interface ScopeFields {
  /** Column holding the responsible user (e.g. assignedToId). Enables the "own" scope. */
  ownerField?: string;
  /** Column holding the branch (or the branch id itself, for the branches table). Enables the "branch" scope. */
  branchField?: string;
}

/**
 * Turns a granted scope into a Prisma `where` fragment, so a list/read query returns only what the
 * caller's role reaches. Always combine it with the tenant scope (withTenant), never replace it.
 *   organization -> everything in the organization   ({})
 *   branch       -> rows in the caller's branches      (deny-all if the model has no branch column)
 *   own          -> rows the caller is responsible for  (falls back to branch, else deny-all)
 * Unknown or unsupported combinations narrow, never widen (fail closed).
 */
export function scopeWhere(ctx: AuthContext, scope: PermissionScope, fields: ScopeFields): Record<string, unknown> {
  const denyAll = { id: { in: [] as string[] } };
  if (scope === "organization") return {};
  if (scope === "branch") {
    return fields.branchField ? { [fields.branchField]: { in: [...ctx.branchIds] } } : denyAll;
  }
  if (fields.ownerField) return { [fields.ownerField]: ctx.userId };
  return fields.branchField ? { [fields.branchField]: { in: [...ctx.branchIds] } } : denyAll;
}

/** The same narrowing as scopeWhere, in the shape SQL functions take (see the dashboard_* functions). */
export interface ScopeFilter {
  /** null = every branch; an array = only these (an empty array matches nothing). */
  branchIds: string[] | null;
  /** null = every owner; otherwise only rows owned by / assigned to this user. */
  ownerId: string | null;
}

/** Mirrors scopeWhere exactly, including failing closed (empty branch list) when a table cannot express the scope. */
export function scopeFilter(ctx: AuthContext, scope: PermissionScope, fields: ScopeFields): ScopeFilter {
  if (scope === "organization") return { branchIds: null, ownerId: null };
  if (scope === "branch") return { branchIds: fields.branchField ? [...ctx.branchIds] : [], ownerId: null };
  if (fields.ownerField) return { branchIds: null, ownerId: ctx.userId };
  return { branchIds: fields.branchField ? [...ctx.branchIds] : [], ownerId: null };
}

/** Single-record check matching scopeWhere, for update/delete of a row that was already loaded. */
export function scopeAllows(
  ctx: AuthContext,
  scope: PermissionScope,
  fields: ScopeFields,
  row: Record<string, unknown>
): boolean {
  if (scope === "organization") return true;
  if (scope === "branch") return !!fields.branchField && ctx.branchIds.includes(String(row[fields.branchField]));
  if (fields.ownerField) return row[fields.ownerField] === ctx.userId;
  return !!fields.branchField && ctx.branchIds.includes(String(row[fields.branchField]));
}

const SCOPE_RANK: Record<PermissionScope, number> = { own: 0, branch: 1, organization: 2 };

/** True when the caller holds the permission with a scope at least as wide as `scope` (used to stop privilege escalation). */
export function holdsAtLeast(ctx: AuthContext, key: string, scope: PermissionScope): boolean {
  const held = ctx.permissions.get(key);
  return held !== undefined && SCOPE_RANK[held] >= SCOPE_RANK[scope];
}
