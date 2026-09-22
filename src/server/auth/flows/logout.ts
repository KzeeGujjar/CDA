import { getPlatformDb } from "@/server/db/clients";
import type { RequestMeta } from "@/server/http/api-route";
import { hashSessionToken, revokeSession } from "../session";
import { auditAuth } from "./common";

/**
 * Signs out the session named by the cookie. Always succeeds from the caller's point of view (an
 * already-expired or unknown cookie is simply cleared), so the endpoint reveals nothing.
 */
export async function logout(token: string | undefined, meta: RequestMeta): Promise<void> {
  if (!token || token.length < 20 || token.length > 200) return;
  const db = getPlatformDb();
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, organizationId: true, userId: true, revokedAt: true, user: { select: { name: true } } },
  });
  if (!session || session.revokedAt) return;
  await revokeSession(db, session.id, "signed_out");
  await auditAuth(db, {
    organizationId: session.organizationId,
    userId: session.userId,
    userName: session.user.name,
    action: "auth.logout",
    entityType: "session",
    entityId: session.id,
    meta,
  });
}
