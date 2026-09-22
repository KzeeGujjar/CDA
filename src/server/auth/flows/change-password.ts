import { z } from "zod";
import type { AuthContext } from "../context";
import { getPlatformDb } from "@/server/db/clients";
import { withTenant } from "@/server/db/tenant";
import { badRequest, unauthorized, weakPassword } from "@/server/lib/errors";
import { defer } from "@/server/lib/defer";
import { sendEmail } from "@/server/email/transport";
import { passwordChangedMessage } from "@/server/email/templates";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { assertAcceptablePassword, hashPassword, verifyPassword } from "../password";
import { enforce, LIMITS } from "../rate-limit";
import { revokeUserSessions } from "../session";
import { passwordInputSchema } from "./common";

export const changePasswordSchema = z.strictObject({
  currentPassword: passwordInputSchema,
  newPassword: passwordInputSchema,
});

/**
 * Authenticated password change. Requires the current password (a stolen session alone cannot change
 * it), then signs out every OTHER session while keeping the caller signed in.
 */
export async function changePassword(
  ctx: AuthContext,
  input: z.infer<typeof changePasswordSchema>,
  meta: RequestMeta
): Promise<{ changed: true; otherSessionsRevoked: number }> {
  const platform = getPlatformDb();
  await enforce(platform, [LIMITS.changePassword(ctx.userId)]);

  const user = await withTenant(ctx, (db) =>
    db.user.findFirst({ where: { id: ctx.userId }, select: { id: true, name: true, email: true, passwordHash: true } })
  );
  if (!user?.passwordHash) throw unauthorized();

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw badRequest("The current password is incorrect.", "invalid_current_password");
  }
  if (input.newPassword === input.currentPassword) {
    throw badRequest("Choose a password different from the current one.", "password_unchanged");
  }
  const problems = await assertAcceptablePassword(input.newPassword, { email: user.email, name: user.name });
  if (problems.length) throw weakPassword(problems);

  const passwordHash = await hashPassword(input.newPassword);
  await withTenant(ctx, async (db) => {
    await db.user.update({
      where: { id: ctx.userId },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0 },
    });
    await recordAudit(db, ctx, { action: "auth.password_changed", entityType: "user", entityId: ctx.userId, ...meta });
  });
  const otherSessionsRevoked = await revokeUserSessions(platform, ctx.userId, {
    exceptSessionId: ctx.sessionId,
    reason: "password_changed",
  });
  defer(() => sendEmail(passwordChangedMessage(user.email, user.name)));
  return { changed: true, otherSessionsRevoked };
}
