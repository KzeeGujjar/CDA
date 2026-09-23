/**
 * Exercises the general rate-limiting backstop every request goes through (§0.25: Security —
 * src/server/http/api-route.ts's execute(), LIMITS.apiUser/apiIp in src/server/auth/rate-limit.ts), at its
 * real production defaults (600/min per authenticated user, 120/min per IP for public routes) — the existing
 * 38 other check scripts stay comfortably under these on purpose, so none of them exercises the ceiling
 * itself. This one does, with enough concurrent requests to actually reach it.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:rate-limit-http
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};

async function callOnce(path: string, headers: Record<string, string>): Promise<{ status: number; retryAfter: string | null }> {
  const res = await fetch(`${BASE}${path}`, { headers });
  return { status: res.status, retryAfter: res.headers.get("retry-after") };
}

async function main() {
  const org = await db.organization.create({
    data: { name: `RateLimit ${suffix}`, email: `ratelimit-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const mk = async (key: string) => {
    const user = await db.user.create({
      data: { organizationId: org.id, roleId: roles.dealerOwner, name: key, email: `${key}-${suffix}@example.com`.toLowerCase(), status: "ACTIVE" },
    });
    return (await createSession(db, { organizationId: org.id, userId: user.id })).token;
  };
  const tokenA = await mk("hammered");
  const tokenB = await mk("unaffected");

  // ═════════ 1. per authenticated user: 600/min default ═════════
  const N = 650;
  const results = await Promise.all(
    Array.from({ length: N }, () => callOnce("/api/v1/auth/me", { cookie: `${sessionCookieName()}=${tokenA}` }))
  );
  const limited = results.filter((r) => r.status === 429);
  ok(
    `${N} rapid requests on one session trip the general per-user limit (>=1 got 429)`,
    limited.length >= 1,
    `statuses: ${[...new Set(results.map((r) => r.status))].join(",")}`
  );
  ok("a 429 carries a Retry-After header", limited.length > 0 && limited.every((r) => r.retryAfter !== null && Number(r.retryAfter) > 0));

  const otherUser = await callOnce("/api/v1/auth/me", { cookie: `${sessionCookieName()}=${tokenB}` });
  ok("...but a different user's session is completely unaffected", otherUser.status === 200);

  // ═════════ 2. per IP, for a public route: 120/min default ═════════
  const fixedIp = "10.77.77.77";
  const publicResults = await Promise.all(
    Array.from({ length: 150 }, () => callOnce("/api/v1/generated-documents/shared/not-a-real-token-000000000000", { "x-real-ip": fixedIp }))
  );
  const publicLimited = publicResults.filter((r) => r.status === 429);
  ok(
    "150 rapid requests from one IP on a public route trip the general per-IP limit (>=1 got 429)",
    publicLimited.length >= 1,
    `statuses: ${[...new Set(publicResults.map((r) => r.status))].join(",")}`
  );
  const otherIp = await callOnce("/api/v1/generated-documents/shared/not-a-real-token-000000000000", { "x-real-ip": "10.88.88.88" });
  ok("...but a different IP is unaffected (still a clean 404, not 429)", otherIp.status === 404);
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(`\nRate limit HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
      process.exit(1);
    }
    console.log(`Rate limit HTTP check OK: ${passed} assertions passed.`);
  });
