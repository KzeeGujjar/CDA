/**
 * Runs the REAL frontend service layer (src/services/authService.ts, ai-assistant.ts, backend.ts) against the running
 * app, with a fetch that behaves like a browser (relative URLs, cookie jar). Checks the hybrid behaviour:
 * demo mode without a session, live mode after a real sign-in, the agent thread mapping, approvals, sign-out,
 * and the fall-back to demo data when no backend answers.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... npm run check:ai-agent-frontend   (app on :3100, fake AI on :54350)
 */
import { createPrismaClient } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1.");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
if (!/127\.0\.0\.1|localhost/.test(ownerUrl)) throw new Error("Refusing to run against a non-local database.");
const FAKE = process.env.CHECK_FAKE_AI_URL ?? "http://127.0.0.1:54350";

let base = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const jar = new Map<string, string>();
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" && input.startsWith("/") ? `${base}${input}` : input;
  const headers = new Headers(init?.headers);
  headers.set("x-real-ip", `10.${runOctets[0]}.${runOctets[1]}.${(ipCounter++ % 250) + 1}`);
  if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  const res = await realFetch(url, { ...init, headers });
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at);
    const value = pair.slice(at + 1);
    if (/max-age=0|expires=thu, 01 jan 1970/i.test(line) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
  return res;
}) as typeof fetch;

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const fails = async (
  fn: () => Promise<unknown>
): Promise<{ message?: string; status?: number; code?: string } | null> =>
  fn().then(
    () => null,
    (e) => e
  );

async function main() {
  const { login, logout, getBackendUser } = await import("@/services/authService");
  const { getChatThreads, getChatThreadById, sendToAssistant, decideAgentAction } =
    await import("@/services/aiService");
  const { backendMode, resetBackendMode } = await import("@/services/backend");

  const suffix = Date.now().toString(36);
  const password = "Frontend-Check-2026!z";
  const org = await db.organization.create({
    data: { name: `Frontend ${suffix}`, email: `fe-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const email = `owner-fe-${suffix}@example.com`;
  await db.user.create({
    data: {
      organizationId: org.id,
      roleId: roles.dealerOwner,
      name: "Frontend Owner",
      email,
      status: "ACTIVE",
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
  });
  await fetch(`${FAKE}/__admin/reset`, { method: "POST", body: "{}" });

  // 1. no session: demo mode, sample conversations
  ok("no session: demo mode", (await backendMode()) === "demo");
  const demoThreads = await getChatThreads();
  ok(
    "...and the built-in sample conversations are shown",
    demoThreads.length > 0 && demoThreads.every((t) => t.id.startsWith("thread") || t.messages.length > 0)
  );
  ok("...and no backend user", (await getBackendUser()) === null);

  // 2. real sign-in
  const bad = await fails(() => login({ email, password: "wrong-password-123" }));
  ok(
    "a wrong password on a live backend is a real error (not silently accepted as demo)",
    bad?.status === 401 && bad.code === "invalid_credentials",
    JSON.stringify(bad)
  );
  const session = await login({ email, password });
  ok(
    "sign-in returns the real user and role, and keeps no token in the browser code",
    session.user.email === email && session.user.role === "dealerOwner" && session.token === ""
  );
  ok("the session is an httpOnly cookie held by the browser jar", jar.size === 1);
  ok("the server confirms who is signed in", (await getBackendUser())?.email === email);
  ok("...and the app is now in live mode", (await backendMode()) === "live");

  // 3. the agent through the same functions the page uses
  ok("live mode starts with no conversations (not the demo ones)", (await getChatThreads()).length === 0);
  const r1 = await sendToAssistant(null, "How is stock? [[tool:getInventory]]");
  ok(
    "sending creates a server conversation and returns the agent's answer",
    !!r1.threadId && r1.reply.startsWith("[anthropic] tool results:"),
    r1.reply.slice(0, 120)
  );
  const list = await getChatThreads();
  ok(
    "the conversation is listed with its title",
    list.length === 1 && list[0].id === r1.threadId && list[0].title.startsWith("How is stock")
  );
  const t1 = await getChatThreadById(r1.threadId);
  ok(
    "the thread has the user's message and the answer, with the tool the agent used",
    !!t1 &&
      t1.messages.length === 2 &&
      t1.messages[0].role === "user" &&
      t1.messages[1].role === "assistant" &&
      t1.messages[1].toolCalls?.[0]?.tool === "getInventory" &&
      t1.messages[1].toolCalls[0].status === "ok",
    JSON.stringify(t1?.messages.map((m) => [m.role, m.toolCalls?.map((c) => c.tool)]))
  );
  ok(
    "the assistant message id returned matches the stored one (for the reveal animation)",
    t1?.messages[1].id === r1.assistantMessageId
  );

  const r2 = await sendToAssistant(
    r1.threadId,
    'Remind me [[tool:createTask {"title":"Call the buyer","dueAt":"2030-05-01T10:00:00+04:00"}]]'
  );
  ok("a follow-up goes into the same conversation", r2.threadId === r1.threadId);
  const t2 = await getChatThreadById(r1.threadId);
  const proposal = t2?.messages.at(-1)?.toolCalls?.find((c) => c.tool === "createTask");
  ok(
    "a proposed action arrives as awaiting approval, with what it will do",
    proposal?.status === "awaiting_confirmation" &&
      proposal.requiresApproval &&
      /Call the buyer/.test(proposal.summary ?? ""),
    JSON.stringify(proposal)
  );
  ok("nothing has been created yet", (await db.task.count({ where: { organizationId: org.id } })) === 0);
  await decideAgentAction(proposal!.id, "approve");
  const t3 = await getChatThreadById(r1.threadId);
  ok(
    "after Approve the card shows it as done, and the task exists",
    t3?.messages.at(-1)?.toolCalls?.find((c) => c.tool === "createTask")?.status === "executed" &&
      (await db.task.count({ where: { organizationId: org.id, title: "Call the buyer" } })) === 1
  );
  const again = await fails(() => decideAgentAction(proposal!.id, "approve"));
  ok(
    "approving twice is refused with the server's message",
    again?.status === 409 && !!again.message,
    JSON.stringify(again)
  );
  ok(
    "a conversation that is not yours is 'not found' (null), not an error page",
    (await getChatThreadById("does-not-exist")) === null
  );

  // 4. sign out
  await logout();
  ok("sign-out clears the session cookie", jar.size === 0);
  ok(
    "...and the app is back in demo mode with the sample conversations",
    (await backendMode()) === "demo" && (await getChatThreads()).length > 0
  );
  const gone = await db.session.count({ where: { organizationId: org.id, revokedAt: null } });
  ok("...and the server-side session was revoked", gone === 0, `${gone} active`);

  // 5. an expired/invalid session mid-use is an error the page can show, and returns to demo mode afterwards
  await login({ email, password });
  ok("live again after signing back in", (await backendMode()) === "live");
  await db.session.updateMany({ where: { organizationId: org.id }, data: { revokedAt: new Date() } });
  const expired = await fails(() => sendToAssistant(null, "hello"));
  ok("a revoked session gives a 401 error the page can show", expired?.status === 401, JSON.stringify(expired));
  ok("...and the app drops back to demo mode", (await backendMode()) === "demo");
  jar.clear();
  resetBackendMode();

  // 6. no backend at all (nothing listens): everything falls back to the original demo behaviour
  base = "http://127.0.0.1:9";
  resetBackendMode();
  ok("nothing listening: demo mode", (await backendMode()) === "demo");
  const demoLogin = await login({ email: "anyone@example.com", password: "anything" });
  ok(
    "...and the demo sign-in still works",
    demoLogin.token.startsWith("mock-token") && demoLogin.user.role === "dealerOwner"
  );
  const demoSend = await sendToAssistant(null, "Summarize today's leads");
  ok("...and the demo assistant still answers", demoSend.reply.length > 0 && !!demoSend.threadId.startsWith("thread"));
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nAI agent frontend check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`AI agent frontend check OK: ${passed} assertions passed.`);
  });
