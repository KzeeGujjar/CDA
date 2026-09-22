import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenPurpose, PrismaClient } from "@/generated/prisma/client";

/**
 * One-time tokens (email verification, password reset, invitations). The raw token exists only in the
 * emailed link; the database stores its SHA-256, so a database leak cannot be used to take over accounts.
 * 256 bits of entropy, single use, short-lived.
 */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Syntactic sanity check before touching the database (also bounds work for junk input). */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** Issues a fresh token for a user and invalidates any earlier unused token of the same purpose. */
export async function issueAuthToken(
  platformDb: PrismaClient,
  input: { organizationId: string; userId: string; purpose: AuthTokenPurpose; ttlMs: number }
): Promise<string> {
  const token = generateToken();
  await platformDb.$transaction([
    platformDb.authToken.updateMany({
      where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    platformDb.authToken.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        purpose: input.purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + input.ttlMs),
      },
    }),
  ]);
  return token;
}

/**
 * Atomically consumes a token: the UPDATE only matches an unused, unexpired token of the right purpose,
 * so two concurrent requests cannot both succeed. Returns the owner or null.
 */
export async function consumeAuthToken(
  platformDb: PrismaClient,
  token: string,
  purpose: AuthTokenPurpose
): Promise<{ userId: string; organizationId: string } | null> {
  if (!looksLikeToken(token)) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const claimed = await platformDb.authToken.updateMany({
    where: { tokenHash, purpose, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) return null;
  const row = await platformDb.authToken.findUnique({
    where: { tokenHash },
    select: { userId: true, organizationId: true },
  });
  return row ?? null;
}
