import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { tooManyRequests } from "@/server/lib/errors";

/**
 * Fixed-window rate limiting in Postgres (shared by every serverless instance; no Redis needed yet).
 * Keys are SHA-256("<scope>:<identifier>"), so the table stores no emails or IP addresses. Scopes are
 * applied to unknown identifiers too (e.g. an email that has no account), so limiting behaves the same
 * whether or not the account exists and cannot be used to discover accounts.
 */
export interface LimitRule {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

const bucketKey = (scope: string, identifier: string) =>
  createHash("sha256").update(`${scope}:${identifier.toLowerCase()}`).digest("hex");

interface Row {
  count: number;
  retry_after: number;
}

/** Records one attempt; returns whether it is within the limit and how long until the window resets. */
export async function hit(
  platformDb: PrismaClient,
  rule: LimitRule
): Promise<{ allowed: boolean; retryAfter: number }> {
  const key = bucketKey(rule.scope, rule.identifier);
  const window = rule.windowSeconds;
  const rows = await platformDb.$queryRaw<Row[]>`
    INSERT INTO rate_limit_buckets ("key", "count", "window_start")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limit_buckets."window_start" <= now() - make_interval(secs => ${window}::float8)
                     THEN 1 ELSE rate_limit_buckets."count" + 1 END,
      "window_start" = CASE WHEN rate_limit_buckets."window_start" <= now() - make_interval(secs => ${window}::float8)
                            THEN now() ELSE rate_limit_buckets."window_start" END
    RETURNING "count",
      GREATEST(1, EXTRACT(EPOCH FROM (rate_limit_buckets."window_start" + make_interval(secs => ${window}::float8) - now())))::float8 AS retry_after`;
  const row = rows[0];
  return { allowed: row.count <= rule.limit, retryAfter: row.retry_after };
}

/** Throws HTTP 429 (with Retry-After) as soon as any rule is exceeded. */
export async function enforce(platformDb: PrismaClient, rules: LimitRule[]): Promise<void> {
  for (const rule of rules) {
    const result = await hit(platformDb, rule);
    if (!result.allowed) throw tooManyRequests(result.retryAfter);
  }
}

/** Forget a bucket (e.g. after a successful login, so honest typos do not accumulate). */
export async function reset(platformDb: PrismaClient, scope: string, identifier: string): Promise<void> {
  await platformDb.rateLimitBucket.deleteMany({ where: { key: bucketKey(scope, identifier) } });
}

/** Housekeeping: drop buckets whose window ended long ago. Called opportunistically. */
export async function purgeExpired(platformDb: PrismaClient): Promise<void> {
  await platformDb.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * 3600_000) } } });
}

/** Central place for the limits, so they are easy to review and tune. */
export const LIMITS = {
  loginIp: (ip: string): LimitRule => ({ scope: "login:ip", identifier: ip, limit: 30, windowSeconds: 15 * 60 }),
  loginEmail: (email: string): LimitRule => ({
    scope: "login:email",
    identifier: email,
    limit: 10,
    windowSeconds: 15 * 60,
  }),
  loginEmailDaily: (email: string): LimitRule => ({
    scope: "login:email:day",
    identifier: email,
    limit: 30,
    windowSeconds: 24 * 3600,
  }),
  registerIp: (ip: string): LimitRule => ({ scope: "register:ip", identifier: ip, limit: 5, windowSeconds: 3600 }),
  registerEmail: (email: string): LimitRule => ({
    scope: "register:email",
    identifier: email,
    limit: 3,
    windowSeconds: 3600,
  }),
  forgotIp: (ip: string): LimitRule => ({ scope: "forgot:ip", identifier: ip, limit: 10, windowSeconds: 3600 }),
  forgotEmail: (email: string): LimitRule => ({
    scope: "forgot:email",
    identifier: email,
    limit: 3,
    windowSeconds: 3600,
  }),
  resendIp: (ip: string): LimitRule => ({ scope: "resend:ip", identifier: ip, limit: 10, windowSeconds: 3600 }),
  resendEmail: (email: string): LimitRule => ({
    scope: "resend:email",
    identifier: email,
    limit: 3,
    windowSeconds: 3600,
  }),
  tokenIp: (ip: string): LimitRule => ({ scope: "token:ip", identifier: ip, limit: 30, windowSeconds: 3600 }),
  changePassword: (userId: string): LimitRule => ({
    scope: "change-password:user",
    identifier: userId,
    limit: 10,
    windowSeconds: 3600,
  }),
  invite: (userId: string): LimitRule => ({ scope: "invite:user", identifier: userId, limit: 30, windowSeconds: 3600 }),
  /**
   * The general backstop every request goes through (src/server/http/api-route.ts's execute()), independent
   * of the tighter, flow-specific limits above. Generous on purpose — it exists to stop abuse (a script
   * hammering the API), not to throttle normal use, and the default is high enough that no existing test
   * script (which reuses one session token across many assertions) trips it. Override with
   * API_RATE_LIMIT_PER_MINUTE / API_RATE_LIMIT_PER_MINUTE_IP for a deployment that wants it tighter.
   */
  apiUser: (userId: string): LimitRule => ({
    scope: "api:user",
    identifier: userId,
    limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 600,
    windowSeconds: 60,
  }),
  apiIp: (ip: string): LimitRule => ({
    scope: "api:ip",
    identifier: ip,
    limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE_IP) || 120,
    windowSeconds: 60,
  }),
};
