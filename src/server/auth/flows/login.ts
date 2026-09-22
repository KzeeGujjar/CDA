import { z } from "zod";
import { getPlatformDb } from "@/server/db/clients";
import { AppError, forbidden, tooManyRequests } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { needsRehash, hashPassword, verifyAgainstDummy, verifyPassword } from "../password";
import { enforce, LIMITS, reset } from "../rate-limit";
import { createSession } from "../session";
import {
  auditAuth,
  describeDevice,
  emailSchema,
  INVALID_CREDENTIALS_MESSAGE,
  passwordInputSchema,
  rateLimitIp,
} from "./common";

export const loginSchema = z.strictObject({ email: emailSchema, password: passwordInputSchema });
export type LoginInput = z.infer<typeof loginSchema>;

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: { id: string; name: string; email: string; role: string; avatarUrl?: string };
  organization: {
    id: string;
    name: string;
    type: string;
    country: string;
    currency: string;
    timezone: string;
    locale: string;
  };
}

const invalidCredentials = () => new AppError(401, "invalid_credentials", INVALID_CREDENTIALS_MESSAGE);

/**
 * Sign-in. Protections, in order:
 *  1. Rate limits by IP and by email (also for emails with no account, so limiting reveals nothing).
 *  2. Unknown email -> a dummy password check runs so timing matches a real account.
 *  3. One generic "Invalid email or password" for unknown email AND wrong password.
 *  4. Account state (unverified / suspended / organization suspended) is only revealed AFTER the
 *     correct password, so it cannot be used to probe which emails exist.
 *  5. On success the throttles reset, a brand-new session token is minted (no session fixation), and
 *     weaker password hashes are upgraded.
 */
export async function login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
  const db = getPlatformDb();
  await enforce(db, [
    LIMITS.loginIp(rateLimitIp(meta)),
    LIMITS.loginEmail(input.email),
    LIMITS.loginEmailDaily(input.email),
  ]);

  const user = await db.user.findUnique({
    where: { email: input.email },
    include: { role: { select: { key: true } }, organization: true },
  });

  if (!user || !user.passwordHash || user.deletedAt) {
    await verifyAgainstDummy(input.password);
    throw invalidCredentials();
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    await verifyAgainstDummy(input.password);
    throw tooManyRequests((user.lockedUntil.getTime() - now.getTime()) / 1000);
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    await db.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } } });
    await auditAuth(db, {
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      action: "auth.login",
      outcome: "FAILURE",
      metadata: { reason: "bad_password" },
      meta,
    });
    throw invalidCredentials();
  }

  // Correct password from here on: it is now safe to explain the account's state.
  const deny = async (code: string, message: string): Promise<never> => {
    await auditAuth(db, {
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      action: "auth.login",
      outcome: "DENIED",
      metadata: { reason: code },
      meta,
    });
    throw forbidden(message, code);
  };
  if (user.status === "PENDING_VERIFICATION")
    await deny("email_not_verified", "Please confirm your email address before signing in.");
  if (user.status === "SUSPENDED")
    await deny("account_suspended", "This account has been suspended. Contact your administrator.");
  if (user.status !== "ACTIVE") await deny("account_inactive", "This account is not active.");
  if (user.organization.status !== "ACTIVE" || user.organization.deletedAt) {
    await deny("organization_suspended", "This organization is not active. Contact support.");
  }

  await Promise.all([reset(db, "login:email", input.email), reset(db, "login:email:day", input.email)]);

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: now,
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });

  const session = await createSession(db, {
    organizationId: user.organizationId,
    userId: user.id,
    userAgent: meta.userAgent?.slice(0, 300),
    ipAddress: meta.ipAddress && /^[0-9a-fA-F:.]+$/.test(meta.ipAddress) ? meta.ipAddress : undefined,
    device: describeDevice(meta.userAgent),
  });
  await auditAuth(db, {
    organizationId: user.organizationId,
    userId: user.id,
    userName: user.name,
    action: "auth.login",
    entityType: "session",
    entityId: session.sessionId,
    meta,
  });

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: user.id, name: user.name, email: user.email, role: user.role.key, avatarUrl: user.avatar ?? undefined },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      type: user.organization.type.toLowerCase(),
      country: user.organization.country,
      currency: user.organization.currency,
      timezone: user.organization.timezone,
      locale: user.organization.locale,
    },
  };
}
