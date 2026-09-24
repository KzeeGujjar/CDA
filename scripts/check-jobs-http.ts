/**
 * End-to-end check of the background jobs endpoint (§0.28): GET /api/v1/internal/maintenance-jobs, gated by
 * CRON_SECRET, and specifically the message-retry job (storage maintenance and task reminders already have
 * their own coverage in check-storage-http.ts and check-tasks-http.ts). Needs, on a THROWAWAY migrated +
 * seeded database, a RUNNING app with:
 *   - CRON_SECRET set (the same value this script uses)
 *   - the fake WhatsApp/Twilio servers running (scripts/fake-messaging-providers.ts) and
 *     WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN/WHATSAPP_BASE_URL/TWILIO_* pointed at them,
 *     exactly as check-messages-http.ts requires
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CRON_SECRET=... CHECK_BASE_URL=http://localhost:3100 npm run check:jobs-http
 */
import { createPrismaClient } from "@/server/db/client";
import { runMessageRetries } from "@/server/platform/message-retries";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) throw new Error("Set CRON_SECRET (the running app must be started with the same value).");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

async function main() {
  same(
    "no secret -> 401",
    (await fetch(`${BASE}/api/v1/internal/maintenance-jobs`)).status,
    401
  );
  same(
    "wrong secret -> 401",
    (await fetch(`${BASE}/api/v1/internal/maintenance-jobs`, { headers: { authorization: "Bearer wrong-secret" } })).status,
    401
  );

  const org = await db.organization.create({
    data: { name: `Jobs Check ${suffix}`, email: `jobs-check-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const goodConvo = await db.conversation.create({
    data: {
      organizationId: org.id,
      channel: "WHATSAPP",
      contactName: "Retry Test",
      contactHandle: `9715${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    },
  });
  const failConvo = await db.conversation.create({
    data: { organizationId: org.id, channel: "WHATSAPP", contactName: "Perma Fail", contactHandle: `fail-9715${suffix}` },
  });

  const recoverable = await db.message.create({
    data: { organizationId: org.id, conversationId: goodConvo.id, direction: "OUTBOUND", status: "FAILED", body: "retry me", errorCode: "send_failed" },
  });
  const permanentlyFailing = await db.message.create({
    data: { organizationId: org.id, conversationId: failConvo.id, direction: "OUTBOUND", status: "FAILED", body: "never lands", errorCode: "send_failed" },
  });
  const notConfigured = await db.message.create({
    data: { organizationId: org.id, conversationId: goodConvo.id, direction: "OUTBOUND", status: "FAILED", body: "no provider", errorCode: "provider_not_configured" },
  });
  const stale = await db.message.create({
    data: {
      organizationId: org.id,
      conversationId: goodConvo.id,
      direction: "OUTBOUND",
      status: "FAILED",
      body: "too old to retry",
      errorCode: "send_failed",
      createdAt: new Date(Date.now() - 25 * 3_600_000),
    },
  });
  const alreadyRetried = await db.message.create({
    data: {
      organizationId: org.id,
      conversationId: goodConvo.id,
      direction: "OUTBOUND",
      status: "FAILED",
      body: "already handled",
      errorCode: "send_failed",
      retriedAt: new Date(Date.now() - 60_000),
    },
  });

  const res = await fetch(`${BASE}/api/v1/internal/maintenance-jobs`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  const json = await res.json();
  same("correct secret -> 200", res.status, 200);
  ok(
    "the response carries a v2 envelope with a summary for every job",
    json?.success === true && !!json.data?.storage && !!json.data?.tasks && !!json.data?.messages && !!json.data?.leadFollowUps,
    JSON.stringify(json)
  );

  const recoveredRow = await db.message.findUniqueOrThrow({ where: { id: recoverable.id } });
  ok(
    "a transient failure to a normal number is recovered: SENT, with a provider id, retriedAt stamped",
    recoveredRow.status === "SENT" && !!recoveredRow.providerMessageId && !!recoveredRow.retriedAt,
    JSON.stringify(recoveredRow)
  );

  const permFailRow = await db.message.findUniqueOrThrow({ where: { id: permanentlyFailing.id } });
  ok(
    "a message to a number the provider always refuses is retried once, stays FAILED, retriedAt stamped",
    permFailRow.status === "FAILED" && !!permFailRow.retriedAt && !!permFailRow.errorCode,
    JSON.stringify(permFailRow)
  );

  const notConfiguredRow = await db.message.findUniqueOrThrow({ where: { id: notConfigured.id } });
  ok(
    "provider_not_configured is never retried (retrying would just fail again)",
    notConfiguredRow.retriedAt === null
  );

  const staleRow = await db.message.findUniqueOrThrow({ where: { id: stale.id } });
  ok("a failure older than the retry window is left alone", staleRow.retriedAt === null);

  const alreadyRetriedRow = await db.message.findUniqueOrThrow({ where: { id: alreadyRetried.id } });
  same(
    "a message already retried once is not retried again",
    alreadyRetriedRow.retriedAt?.toISOString(),
    alreadyRetried.retriedAt?.toISOString()
  );

  // Idempotency at the function level, isolated from any other organization's data other test runs may have
  // left in the platform database (the job legitimately scans across all organizations).
  const before = (await db.message.findUniqueOrThrow({ where: { id: permanentlyFailing.id } })).retriedAt;
  await runMessageRetries();
  const after = (await db.message.findUniqueOrThrow({ where: { id: permanentlyFailing.id } })).retriedAt;
  same("running the job again does not re-retry an already-retried message", after?.toISOString(), before?.toISOString());

  console.log(
    failures.length
      ? `Jobs HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      : `Jobs HTTP check OK (${passed} passed, 0 failed)`
  );
  process.exit(failures.length ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("Jobs HTTP check crashed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
