import { z } from "zod";
import { getPlatformDb } from "@/server/db/clients";
import { badRequest, weakPassword } from "@/server/lib/errors";
import { defer } from "@/server/lib/defer";
import { sendEmail } from "@/server/email/transport";
import { passwordChangedMessage, passwordResetMessage } from "@/server/email/templates";
import type { RequestMeta } from "@/server/http/api-route";
import { assertAcceptablePassword, hashPassword } from "../password";
import { enforce, LIMITS, reset } from "../rate-limit";
import { revokeUserSessions } from "../session";
import { consumeAuthToken, hashToken, issueAuthToken, looksLikeToken, PASSWORD_RESET_TTL_MS } from "../tokens";
import { auditAuth, emailSchema, passwordInputSchema, rateLimitIp } from "./common";

export const forgotPasswordSchema = z.strictObject({ email: emailSchema });
export const resetPasswordSchema = z.strictObject({ token: z.string().min(1).max(200), password: passwordInputSchema });

/** Same answer whether or not the address has an account. */
export const FORGOT_RESPONSE = {
  message: "If an account exists for that address, we have sent a link to reset the password.",
};

/**
 * Starts a reset. Only the rate limiting happens before the response; looking the user up, issuing the
 * token and sending the email all happen afterwards, so timing does not reveal whether the account exists.
 */
export async function requestPasswordReset(input: z.infer<typeof forgotPasswordSchema>, meta: RequestMeta) {
  const db = getPlatformDb();
  await enforce(db, [LIMITS.forgotIp(rateLimitIp(meta)), LIMITS.forgotEmail(input.email)]);

  defer(async () => {
    const user = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true, status: true, organizationId: true, deletedAt: true },
    });
    // Only verified, active accounts can be reset (an unverified one must verify its email first).
    if (!user || user.deletedAt || user.status !== "ACTIVE") return;
    const token = await issueAuthToken(db, {
      organizationId: user.organizationId,
      userId: user.id,
      purpose: "PASSWORD_RESET",
      ttlMs: PASSWORD_RESET_TTL_MS,
    });
    await auditAuth(db, {
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      action: "auth.password_reset_requested",
      meta,
    });
    await sendEmail(passwordResetMessage(user.email, user.name, token));
  });
  return FORGOT_RESPONSE;
}

/**
 * Completes a reset: validates the new password FIRST (so a weak password does not burn the one-time
 * token), then atomically consumes the token, stores the new hash, and signs out every session.
 */
export async function resetPassword(
  input: z.infer<typeof resetPasswordSchema>,
  meta: RequestMeta
): Promise<{ reset: true }> {
  const db = getPlatformDb();
  await enforce(db, [LIMITS.tokenIp(rateLimitIp(meta))]);
  const invalid = () => badRequest("This link is invalid or has expired.", "invalid_or_expired_token");
  if (!looksLikeToken(input.token)) throw invalid();

  // Peek (without consuming) so the password policy can use the account's email and name.
  const pending = await db.authToken.findFirst({
    where: {
      tokenHash: hashToken(input.token),
      purpose: "PASSWORD_RESET",
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { user: { select: { id: true, name: true, email: true, status: true, organizationId: true } } },
  });
  if (!pending || pending.user.status !== "ACTIVE") throw invalid();

  const problems = await assertAcceptablePassword(input.password, {
    email: pending.user.email,
    name: pending.user.name,
  });
  if (problems.length) throw weakPassword(problems);
  const passwordHash = await hashPassword(input.password);

  const owner = await consumeAuthToken(db, input.token, "PASSWORD_RESET");
  if (!owner || owner.userId !== pending.user.id) throw invalid();

  await db.user.update({
    where: { id: owner.userId },
    data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  const revoked = await revokeUserSessions(db, owner.userId, { reason: "password_reset" });
  await Promise.all([reset(db, "login:email", pending.user.email), reset(db, "login:email:day", pending.user.email)]);
  await auditAuth(db, {
    organizationId: owner.organizationId,
    userId: owner.userId,
    userName: pending.user.name,
    action: "auth.password_reset",
    metadata: { sessionsRevoked: revoked },
    meta,
  });
  defer(() => sendEmail(passwordChangedMessage(pending.user.email, pending.user.name)));
  return { reset: true };
}
