import type { AuthContext } from "../context";
import { withTenant } from "@/server/db/tenant";
import { notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";

/** Compatible with the frontend `SecuritySession` (id, device, location, current) plus timestamps. */
export interface SessionDto {
  id: string;
  device: string;
  location: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

/** The caller's own live sessions. Never another user's, and never the token or its hash. */
export async function listMySessions(ctx: AuthContext): Promise<SessionDto[]> {
  const rows = await withTenant(ctx, (db) =>
    db.session.findMany({
      where: { userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, device: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      orderBy: { lastSeenAt: "desc" },
    })
  );
  return rows.map((s) => ({
    id: s.id,
    device: s.device ?? "Unknown device",
    location: s.ipAddress ?? "Unknown location",
    current: s.id === ctx.sessionId,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }));
}

/** Signs out one of the caller's sessions (a remote device). Someone else's session id is a 404. */
export async function revokeMySession(
  ctx: AuthContext,
  sessionId: string,
  meta: RequestMeta
): Promise<{ revoked: true }> {
  await withTenant(ctx, async (db) => {
    const result = await db.session.updateMany({
      where: { id: sessionId, userId: ctx.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "revoked_by_user" },
    });
    if (result.count !== 1) throw notFound("Session not found.");
    await recordAudit(db, ctx, { action: "auth.session_revoked", entityType: "session", entityId: sessionId, ...meta });
  });
  return { revoked: true };
}

export async function revokeOtherSessions(ctx: AuthContext, meta: RequestMeta): Promise<{ revoked: number }> {
  return withTenant(ctx, async (db) => {
    const result = await db.session.updateMany({
      where: { userId: ctx.userId, revokedAt: null, id: { not: ctx.sessionId } },
      data: { revokedAt: new Date(), revokedReason: "revoked_by_user" },
    });
    await recordAudit(db, ctx, {
      action: "auth.other_sessions_revoked",
      entityType: "user",
      entityId: ctx.userId,
      metadata: { count: result.count },
      ...meta,
    });
    return { revoked: result.count };
  });
}
