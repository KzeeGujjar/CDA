import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { roleKeys, type RoleKey } from "@/lib/settings-roles";
import type { AuthContext } from "./context";
import type { PermissionScope } from "./permission-catalog";

import { SESSION_ABSOLUTE_TTL_MS, SESSION_IDLE_TTL_MS, SESSION_RENEW_AFTER_MS } from "./session-config";

/** The cookie carries a random opaque token; only its SHA-256 is stored, so a DB leak yields no sessions. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Creates a session and returns the raw token (shown once, set as an httpOnly cookie by the caller). */
export async function createSession(
  platformDb: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    userAgent?: string;
    ipAddress?: string;
    device?: string;
    ttlMs?: number;
  }
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? SESSION_IDLE_TTL_MS));
  const session = await platformDb.session.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      tokenHash: hashSessionToken(token),
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      device: input.device,
      expiresAt,
    },
    select: { id: true },
  });
  return { token, sessionId: session.id, expiresAt };
}

export async function revokeSession(platformDb: PrismaClient, sessionId: string, reason = "signed_out"): Promise<void> {
  await platformDb.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

const SCOPE_ORDER: Record<PermissionScope, number> = { own: 0, branch: 1, organization: 2 };

/**
 * Turns a session cookie value into an AuthContext, or null if it is not a valid live session.
 * THE single place the tenant is determined. Every check is re-evaluated on every request, so
 * suspending a user or organization, revoking a session, or editing a role takes effect immediately.
 */
export async function resolveSessionContext(
  platformDb: PrismaClient,
  token: string | undefined
): Promise<AuthContext | null> {
  if (!token || token.length < 20 || token.length > 200) return null;

  const now = new Date();
  const session = await platformDb.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      organization: { select: { id: true, status: true, deletedAt: true } },
      user: {
        include: {
          branches: { select: { branchId: true } },
          role: { include: { permissions: { include: { permission: { select: { key: true } } } } } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt || session.expiresAt <= now) return null;
  const { user, organization } = session;
  if (organization.status !== "ACTIVE" || organization.deletedAt) return null;
  if (user.status !== "ACTIVE" || user.deletedAt) return null;
  if (user.lockedUntil && user.lockedUntil > now) return null;
  // Defence in depth: the composite foreign keys already guarantee this; verify anyway.
  if (user.organizationId !== session.organizationId || user.role.organizationId !== session.organizationId)
    return null;

  // Hard ceiling: however active, a session cannot outlive SESSION_ABSOLUTE_TTL_MS.
  const absoluteEnd = session.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS;
  if (now.getTime() >= absoluteEnd) return null;

  // Sliding renewal (at most every few minutes to avoid a write per request).
  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_RENEW_AFTER_MS) {
    const renewedExpiry = new Date(Math.min(now.getTime() + SESSION_IDLE_TTL_MS, absoluteEnd));
    await platformDb.session.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt: renewedExpiry } });
  }

  const permissions = new Map<string, PermissionScope>();
  for (const rp of user.role.permissions) {
    const scope = rp.scope.toLowerCase() as PermissionScope;
    const current = permissions.get(rp.permission.key);
    if (!current || SCOPE_ORDER[scope] > SCOPE_ORDER[current]) permissions.set(rp.permission.key, scope);
  }

  return {
    organizationId: session.organizationId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    roleId: user.roleId,
    roleKey: user.role.key,
    roleRank: user.role.rank,
    sessionId: session.id,
    branchIds: user.branches.map((b) => b.branchId),
    permissions,
    builtInRole: (roleKeys as readonly string[]).includes(user.role.key) ? (user.role.key as RoleKey) : undefined,
  };
}

/**
 * Revokes every live session of a user (optionally keeping one). Used on password change/reset and when
 * an account is suspended, so old credentials stop working immediately.
 */
export async function revokeUserSessions(
  platformDb: PrismaClient,
  userId: string,
  options: { exceptSessionId?: string; reason: string }
): Promise<number> {
  const result = await platformDb.session.updateMany({
    where: { userId, revokedAt: null, ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: options.reason },
  });
  return result.count;
}
