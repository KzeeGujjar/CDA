import { z } from "zod";
import { getPlatformDb } from "@/server/db/clients";
import { badRequest } from "@/server/lib/errors";
import { defer } from "@/server/lib/defer";
import { sendEmail } from "@/server/email/transport";
import { verifyEmailMessage } from "@/server/email/templates";
import type { RequestMeta } from "@/server/http/api-route";
import { enforce, LIMITS } from "../rate-limit";
import { consumeAuthToken, EMAIL_VERIFICATION_TTL_MS, issueAuthToken } from "../tokens";
import { auditAuth, emailSchema, rateLimitIp } from "./common";

export const verifyEmailSchema = z.strictObject({ token: z.string().min(1).max(200) });
export const resendVerificationSchema = z.strictObject({ email: emailSchema });

const INVALID = () => badRequest("This link is invalid or has expired.", "invalid_or_expired_token");

/** Activates a PENDING_VERIFICATION account. Single-use, 24 h. Does not sign the user in. */
export async function verifyEmail(
  input: z.infer<typeof verifyEmailSchema>,
  meta: RequestMeta
): Promise<{ verified: true }> {
  const db = getPlatformDb();
  await enforce(db, [LIMITS.tokenIp(rateLimitIp(meta))]);

  const owner = await consumeAuthToken(db, input.token, "EMAIL_VERIFICATION");
  if (!owner) throw INVALID();

  const user = await db.user.findUnique({
    where: { id: owner.userId },
    select: { id: true, name: true, status: true, organizationId: true },
  });
  if (!user) throw INVALID();

  // Only a pending account becomes active. A suspended user stays suspended.
  if (user.status === "PENDING_VERIFICATION") {
    await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", emailVerifiedAt: new Date() } });
  } else if (user.status === "ACTIVE") {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }
  await auditAuth(db, {
    organizationId: user.organizationId,
    userId: user.id,
    userName: user.name,
    action: "auth.email_verified",
    meta,
  });
  return { verified: true };
}

export const RESEND_RESPONSE = {
  message: "If an unverified account exists for that address, we have sent a new confirmation email.",
};

export async function resendVerification(input: z.infer<typeof resendVerificationSchema>, meta: RequestMeta) {
  const db = getPlatformDb();
  await enforce(db, [LIMITS.resendIp(rateLimitIp(meta)), LIMITS.resendEmail(input.email)]);

  // All account-dependent work happens after the response, so timing is identical for every address.
  defer(async () => {
    const user = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true, status: true, organizationId: true },
    });
    if (!user || user.status !== "PENDING_VERIFICATION") return;
    const token = await issueAuthToken(db, {
      organizationId: user.organizationId,
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      ttlMs: EMAIL_VERIFICATION_TTL_MS,
    });
    await sendEmail(verifyEmailMessage(user.email, user.name, token));
  });
  return RESEND_RESPONSE;
}
