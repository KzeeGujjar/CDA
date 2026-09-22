import { randomBytes } from "node:crypto";
import { z } from "zod";
import { moduleKeys, roleKeys, type ModuleKey } from "@/lib/settings-roles";
import type { AuthContext } from "@/server/auth/context";
import { holdsAtLeast, requirePermission } from "@/server/auth/authorize";
import {
  allPermissions,
  permissionActions,
  permissionCatalog,
  permissionScopes,
  type PermissionAction,
  type PermissionResource,
  type PermissionScope,
} from "@/server/auth/permission-catalog";
import { moduleAccessResource } from "@/server/auth/role-templates";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { badRequest, conflict, forbidden, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";

/**
 * Role and permission management for one organization.
 *
 * Anti-escalation rules (enforced here, on top of the route-level `roles:manage` / `users:update` check):
 *  1. You can only GRANT a permission you hold yourself, at a scope no wider than yours.
 *  2. You can only manage a role that is ranked at or below yours AND whose current permissions are all
 *     within your own authority (a Manager cannot edit a role that can do things a Manager cannot).
 *  3. You cannot edit your own role, so nobody can loosen their own limits.
 *  4. The Dealer Owner role is locked (always full access) and the last active owner cannot be demoted.
 *  5. `platform:manage` is never grantable inside an organization.
 * Role changes take effect on the very next request (permissions are loaded per request).
 */

const knownKeys = new Set(allPermissions.map((p) => p.key));

const grantSchema = z.strictObject({
  permission: z.string().regex(/^[a-z_]+:[a-z]+$/, "Use the form resource:action"),
  scope: z.enum(permissionScopes).default("organization"),
});
export const setPermissionsSchema = z.strictObject({ permissions: z.array(grantSchema).max(200) });
export const createRoleSchema = z.strictObject({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).optional(),
  rank: z.number().int().min(0).max(100),
  permissions: z.array(grantSchema).max(200),
});
export const assignRoleSchema = z.strictObject({ roleId: z.string().min(1).max(40) });
/** Frontend-compatible: { [module]: { [roleKey]: boolean } }. Partial updates are fine. */
export const matrixSchema = z.partialRecord(z.enum(moduleKeys), z.partialRecord(z.enum(roleKeys), z.boolean()));
export type Matrix = Record<ModuleKey, Record<string, boolean>>;

type Grant = { key: string; scope: PermissionScope };
export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  rank: number;
  userCount: number;
  permissionCount: number;
  /** Whether the CALLER may change this role's permissions right now. */
  editable: boolean;
}
export interface RoleDetailDto extends RoleDto {
  permissions: { permission: string; resource: string; action: string; scope: string }[];
}

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  rank: number;
  permissions: { scope: string; permission: { key: string } }[];
  _count?: { users: number };
};

const roleInclude = {
  permissions: { select: { scope: true, permission: { select: { key: true } } } },
  _count: { select: { users: true } },
} as const;

const grantsOf = (role: RoleRow): Grant[] =>
  role.permissions.map((p) => ({ key: p.permission.key, scope: p.scope.toLowerCase() as PermissionScope }));

const withinAuthority = (ctx: AuthContext, grants: Grant[]) => grants.every((g) => holdsAtLeast(ctx, g.key, g.scope));

/** Why the caller may not edit this role, or null when they may. */
function editBlocker(ctx: AuthContext, role: RoleRow): { code: string; message: string; status: 403 | 409 } | null {
  if (role.key === "dealerOwner")
    return {
      status: 409,
      code: "role_locked",
      message: "The Dealer Owner role always has full access and cannot be changed.",
    };
  if (role.id === ctx.roleId)
    return {
      status: 409,
      code: "cannot_edit_own_role",
      message: "You cannot change your own role. Ask someone with a higher role.",
    };
  if (role.rank > ctx.roleRank)
    return { status: 403, code: "role_rank_exceeded", message: "You cannot manage a role ranked above your own." };
  if (!withinAuthority(ctx, grantsOf(role)))
    return {
      status: 403,
      code: "role_exceeds_authority",
      message: "That role can do things your own role cannot, so you cannot manage it.",
    };
  return null;
}
function assertEditable(ctx: AuthContext, role: RoleRow) {
  const blocker = editBlocker(ctx, role);
  if (!blocker) return;
  throw blocker.status === 409 ? conflict(blocker.message, blocker.code) : forbidden(blocker.message, blocker.code);
}

const toDto = (ctx: AuthContext, role: RoleRow): RoleDto => ({
  id: role.id,
  key: role.key,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
  rank: role.rank,
  userCount: role._count?.users ?? 0,
  permissionCount: role.permissions.length,
  editable: ctx.permissions.has("roles:manage") && editBlocker(ctx, role) === null,
});

/** Validates a requested permission set and enforces rule 1 (only grant what you hold). */
function validateGrants(ctx: AuthContext, requested: z.infer<typeof grantSchema>[]): Grant[] {
  const seen = new Map<string, PermissionScope>();
  for (const g of requested) {
    if (!knownKeys.has(g.permission) || g.permission === "platform:manage") {
      throw badRequest(`Unknown permission "${g.permission}".`, "unknown_permission");
    }
    seen.set(g.permission, g.scope);
  }
  const grants = [...seen].map(([key, scope]) => ({ key, scope }));
  const notHeld = grants.filter((g) => !holdsAtLeast(ctx, g.key, g.scope)).map((g) => `${g.key} (${g.scope})`);
  if (notHeld.length) {
    throw forbidden(`You cannot grant permissions you do not hold: ${notHeld.join(", ")}.`, "permission_not_held");
  }
  return grants;
}

async function replacePermissions(db: TenantDb, ctx: AuthContext, roleId: string, grants: Grant[]) {
  const catalog = await db.permission.findMany({
    where: { key: { in: grants.map((g) => g.key) } },
    select: { id: true, key: true },
  });
  const idByKey = new Map(catalog.map((p) => [p.key, p.id]));
  await db.rolePermission.deleteMany({ where: { roleId } });
  if (grants.length) {
    await db.rolePermission.createMany({
      data: grants.map((g) => ({
        roleId,
        permissionId: idByKey.get(g.key)!,
        organizationId: ctx.organizationId,
        scope: g.scope.toUpperCase() as "OWN" | "BRANCH" | "ORGANIZATION",
      })),
    });
  }
}

const diff = (before: Grant[], after: Grant[]) => {
  const b = new Map(before.map((g) => [g.key, g.scope]));
  const a = new Map(after.map((g) => [g.key, g.scope]));
  const added = [...a.keys()].filter((k) => !b.has(k));
  const removed = [...b.keys()].filter((k) => !a.has(k));
  const rescoped = [...a.keys()].filter((k) => b.has(k) && b.get(k) !== a.get(k));
  return { added, removed, rescoped };
};
const list = (keys: string[]) => keys.slice(0, 40).join(",").slice(0, 900);

// ───────────────────────────── queries ─────────────────────────────

/** The catalog of grantable permissions (excludes platform-only ones). */
export async function getCatalog(ctx: AuthContext) {
  requirePermission(ctx, "roles", "read");
  return {
    resources: (Object.keys(permissionCatalog) as PermissionResource[])
      .filter((r) => r !== "platform")
      .map((resource) => ({ resource, actions: [...(permissionCatalog[resource] as readonly PermissionAction[])] })),
    actions: [...permissionActions],
    scopes: [...permissionScopes],
  };
}

export async function listRoles(ctx: AuthContext): Promise<RoleDto[]> {
  requirePermission(ctx, "roles", "read");
  const rows = await withTenant(ctx, (db) =>
    db.role.findMany({ include: roleInclude, orderBy: [{ rank: "desc" }, { name: "asc" }] })
  );
  return rows.map((r) => toDto(ctx, r));
}

export async function getRole(ctx: AuthContext, id: string): Promise<RoleDetailDto> {
  requirePermission(ctx, "roles", "read");
  const row = await withTenant(ctx, (db) => db.role.findFirst({ where: { id }, include: roleInclude }));
  if (!row) throw notFound("Role not found.");
  return {
    ...toDto(ctx, row),
    permissions: grantsOf(row)
      .map((g) => ({ permission: g.key, resource: g.key.split(":")[0], action: g.key.split(":")[1], scope: g.scope }))
      .sort((x, y) => x.permission.localeCompare(y.permission)),
  };
}

// ───────────────────────────── commands ─────────────────────────────

export async function createRole(
  ctx: AuthContext,
  input: z.infer<typeof createRoleSchema>,
  meta: RequestMeta
): Promise<RoleDetailDto> {
  requirePermission(ctx, "roles", "manage");
  if (input.rank > ctx.roleRank)
    throw forbidden("You cannot create a role ranked above your own.", "role_rank_exceeded");
  const grants = validateGrants(ctx, input.permissions);
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "role";

  const created = await withTenant(ctx, async (db) => {
    const clash = await db.role.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) throw conflict("A role with this name already exists.", "role_name_taken");
    const role = await db.role.create({
      data: {
        organizationId: ctx.organizationId,
        key: `custom-${slug}-${randomBytes(2).toString("hex")}`,
        name: input.name,
        description: input.description,
        isSystem: false,
        rank: input.rank,
      },
    });
    await replacePermissions(db, ctx, role.id, grants);
    await recordAudit(db, ctx, {
      action: "role.created",
      entityType: "role",
      entityId: role.id,
      metadata: { name: role.name, rank: role.rank, permissions: grants.length },
      ...meta,
    });
    return role.id;
  });
  return getRole(ctx, created);
}

export async function setRolePermissions(
  ctx: AuthContext,
  roleId: string,
  input: z.infer<typeof setPermissionsSchema>,
  meta: RequestMeta
): Promise<RoleDetailDto> {
  requirePermission(ctx, "roles", "manage");
  const requested = validateGrants(ctx, input.permissions);
  await withTenant(ctx, async (db) => {
    const role = await db.role.findFirst({ where: { id: roleId }, include: roleInclude });
    if (!role) throw notFound("Role not found.");
    assertEditable(ctx, role);
    const change = diff(grantsOf(role), requested);
    await replacePermissions(db, ctx, role.id, requested);
    await recordAudit(db, ctx, {
      action: "role.permissions.updated",
      entityType: "role",
      entityId: role.id,
      metadata: {
        role: role.key,
        added: list(change.added),
        removed: list(change.removed),
        rescoped: list(change.rescoped),
      },
      ...meta,
    });
  });
  return getRole(ctx, roleId);
}

export async function deleteRole(ctx: AuthContext, roleId: string, meta: RequestMeta): Promise<{ deleted: true }> {
  requirePermission(ctx, "roles", "manage");
  await withTenant(ctx, async (db) => {
    const role = await db.role.findFirst({ where: { id: roleId }, include: roleInclude });
    if (!role) throw notFound("Role not found.");
    if (role.isSystem) throw conflict("Built-in roles cannot be deleted.", "role_locked");
    assertEditable(ctx, role);
    const [users, invitations] = await Promise.all([
      db.user.count({ where: { roleId } }),
      db.invitation.count({ where: { roleId } }),
    ]);
    if (users > 0 || invitations > 0)
      throw conflict("This role is still assigned to users or invitations. Reassign them first.", "role_in_use");
    await db.rolePermission.deleteMany({ where: { roleId } });
    await db.role.delete({ where: { id: roleId } });
    await recordAudit(db, ctx, {
      action: "role.deleted",
      entityType: "role",
      entityId: roleId,
      metadata: { role: role.key },
      ...meta,
    });
  });
  return { deleted: true };
}

/** Change which role a user has. */
export async function assignUserRole(
  ctx: AuthContext,
  targetId: string,
  input: z.infer<typeof assignRoleSchema>,
  meta: RequestMeta
): Promise<{ id: string; role: string }> {
  requirePermission(ctx, "users", "update");
  if (targetId === ctx.userId) throw badRequest("You cannot change your own role.", "cannot_change_own_role");

  return withTenant(ctx, async (db) => {
    const target = await db.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, role: { select: { id: true, key: true, rank: true } } },
    });
    if (!target) throw notFound("User not found.");
    if (target.role.rank > ctx.roleRank)
      throw forbidden("You cannot change the role of someone who outranks you.", "role_rank_exceeded");

    const next = await db.role.findFirst({ where: { id: input.roleId }, include: roleInclude });
    if (!next) throw notFound("Role not found.");
    if (next.rank > ctx.roleRank)
      throw forbidden("You cannot assign a role ranked above your own.", "role_rank_exceeded");
    if (!withinAuthority(ctx, grantsOf(next))) {
      throw forbidden(
        "That role can do things your own role cannot, so you cannot assign it.",
        "role_exceeds_authority"
      );
    }
    if (target.role.id === next.id) return { id: target.id, role: next.key };

    if (target.role.key === "dealerOwner" && next.key !== "dealerOwner") {
      const others = await db.user.count({
        where: { id: { not: target.id }, status: "ACTIVE", deletedAt: null, role: { key: "dealerOwner" } },
      });
      if (others === 0) throw conflict("The last active owner cannot be demoted.", "last_owner");
    }

    await db.user.update({ where: { id: target.id }, data: { roleId: next.id } });
    await recordAudit(db, ctx, {
      action: "user.role_changed",
      entityType: "user",
      entityId: target.id,
      metadata: { from: target.role.key, to: next.key },
      ...meta,
    });
    return { id: target.id, role: next.key };
  });
}

// ───────────────────── frontend-compatible module matrix ─────────────────────

/**
 * The Settings > Roles screen edits a module x role grid of booleans. A cell is "on" when the role holds
 * `read` on the module's primary resource. Turning a cell OFF removes every permission on that resource
 * (so nothing writable is left without read); turning it ON grants `read` only (writes are granted through
 * the role permission editor). Same anti-escalation rules as above apply.
 */
export async function getMatrix(ctx: AuthContext): Promise<Matrix> {
  requirePermission(ctx, "roles", "read");
  const roles = await withTenant(ctx, (db) => db.role.findMany({ include: roleInclude }));
  return buildMatrix(roles);
}

function buildMatrix(roles: RoleRow[]): Matrix {
  const byKey = new Map(roles.map((r) => [r.key, new Set(r.permissions.map((p) => p.permission.key))]));
  const matrix = {} as Matrix;
  for (const mod of moduleKeys) {
    matrix[mod] = {};
    for (const roleKey of roleKeys) {
      matrix[mod][roleKey] =
        roleKey === "superAdmin" ? true : (byKey.get(roleKey)?.has(`${moduleAccessResource[mod]}:read`) ?? false);
    }
  }
  return matrix;
}

export async function updateMatrix(
  ctx: AuthContext,
  changes: z.infer<typeof matrixSchema>,
  meta: RequestMeta
): Promise<Matrix> {
  requirePermission(ctx, "roles", "manage");
  return withTenant(ctx, async (db) => {
    const roles = await db.role.findMany({ include: roleInclude });
    const current = buildMatrix(roles);
    const roleByKey = new Map(roles.map((r) => [r.key, r]));

    for (const mod of moduleKeys) {
      for (const [roleKey, value] of Object.entries(changes[mod] ?? {})) {
        if (value === undefined || current[mod][roleKey] === value) continue; // unchanged cells are ignored
        const role = roleByKey.get(roleKey);
        if (!role) {
          if (roleKey === "superAdmin") throw conflict("Super Admin access cannot be changed.", "role_locked");
          throw notFound("Role not found.");
        }
        assertEditable(ctx, role);
        const resource = moduleAccessResource[mod];
        if (value) {
          if (!holdsAtLeast(ctx, `${resource}:read`, "organization")) {
            throw forbidden(`You cannot grant access to ${mod}: you do not hold it yourself.`, "permission_not_held");
          }
          const perm = await db.permission.findFirstOrThrow({ where: { key: `${resource}:read` } });
          await db.rolePermission.create({
            data: { roleId: role.id, permissionId: perm.id, organizationId: ctx.organizationId },
          });
        } else {
          const keys = (permissionCatalog[resource] as readonly string[]).map((a) => `${resource}:${a}`);
          const perms = await db.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
          await db.rolePermission.deleteMany({
            where: { roleId: role.id, permissionId: { in: perms.map((p) => p.id) } },
          });
        }
        await recordAudit(db, ctx, {
          action: "role.permissions.updated",
          entityType: "role",
          entityId: role.id,
          metadata: { role: role.key, module: mod, granted: value },
          ...meta,
        });
        current[mod][roleKey] = value;
      }
    }
    return buildMatrix(await db.role.findMany({ include: roleInclude }));
  });
}
