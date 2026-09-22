import { z } from "zod";
import type { AuthContext } from "../context";
import { requirePermission } from "../authorize";
import { getPlatformDb } from "@/server/db/clients";
import { withTenant } from "@/server/db/tenant";
import { badRequest, conflict, forbidden, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { revokeUserSessions } from "../session";

export const setUserStatusSchema = z.strictObject({ status: z.enum(["active", "suspended"]) });

/**
 * Suspend or re-activate a user in the caller's organization.
 * Rules: you cannot change your own status; you cannot act on someone who outranks you; the last active
 * Dealer Owner cannot be suspended; only ACTIVE <-> SUSPENDED transitions exist here (a pending account
 * becomes active by verifying its email, never by an admin). Suspending signs the user out immediately.
 */
export async function setUserStatus(
  ctx: AuthContext,
  targetId: string,
  input: z.infer<typeof setUserStatusSchema>,
  meta: RequestMeta
): Promise<{ id: string; status: string }> {
  requirePermission(ctx, "users", "update");
  if (targetId === ctx.userId)
    throw badRequest("You cannot change your own account status.", "cannot_change_own_status");
  const next = input.status === "active" ? "ACTIVE" : "SUSPENDED";

  await withTenant(ctx, async (db) => {
    const target = await db.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, status: true, role: { select: { key: true, rank: true } } },
    });
    if (!target) throw notFound("User not found.");
    if (target.role.rank > ctx.roleRank)
      throw forbidden("You cannot change the status of someone who outranks you.", "role_rank_exceeded");
    if (target.status !== "ACTIVE" && target.status !== "SUSPENDED") {
      throw conflict("Only active or suspended accounts can be changed.", "invalid_status_transition");
    }
    if (target.status === next) return;

    if (next === "SUSPENDED" && target.role.key === "dealerOwner") {
      const otherOwners = await db.user.count({
        where: { id: { not: target.id }, status: "ACTIVE", deletedAt: null, role: { key: "dealerOwner" } },
      });
      if (otherOwners === 0) throw conflict("The last active owner cannot be suspended.", "last_owner");
    }

    await db.user.update({ where: { id: target.id }, data: { status: next } });
    await recordAudit(db, ctx, {
      action: next === "SUSPENDED" ? "user.suspended" : "user.reactivated",
      entityType: "user",
      entityId: target.id,
      ...meta,
    });
  });

  if (next === "SUSPENDED") await revokeUserSessions(getPlatformDb(), targetId, { reason: "account_suspended" });
  return { id: targetId, status: input.status };
}
