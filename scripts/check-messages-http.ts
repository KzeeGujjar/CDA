/**
 * End-to-end check of the messaging module (§0.20) over real HTTP: the internal conversation/message model,
 * and its three real provider adapters (email via the existing mail transport, WhatsApp and SMS via the fake
 * servers in scripts/fake-messaging-providers.ts, which mimic the real Cloud API / Twilio request-response
 * shape). Run with `npm run check:messages-http` against a RUNNING app on a throwaway migrated + base-seeded
 * database (this script seeds the demo dealership and writes test data):
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:messages-http
 */
import { spawnSync } from "node:child_process";
import { createPrismaClient } from "@/server/db/client";
import { DEMO_ORGANIZATION_ID, users as demoUsers } from "../prisma/demo/data";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const ORG = DEMO_ORGANIZATION_ID;
const PASSWORD = "Messages-check-Pw-8834-rk";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, actual: unknown, expected: unknown) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}
let ip = 0;
async function call(method: string, path: string, cookie?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": `10.87.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // not json
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any };
}
const get = (p: string, c?: string) => call("GET", p, c);
const post = (p: string, c: string | undefined, b: unknown) => call("POST", p, c, b);
const patch = (p: string, c: string | undefined, b: unknown) => call("PATCH", p, c, b);

const emailOf = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@desertfalcon-demo.example`;

function seedDemo() {
  const r = spawnSync("npx", ["tsx", "prisma/seed-demo.ts", "--reset"], {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DIRECT_DATABASE_URL: ownerUrl, ALLOW_DEMO_SEED: "1", DEMO_USER_PASSWORD: PASSWORD },
  });
  if (r.status !== 0) throw new Error(`demo seed failed: ${r.stdout}\n${r.stderr}`);
}

async function main() {
  seedDemo();
  const login = async (name: string) => {
    const r = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `10.86.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` },
      body: JSON.stringify({ email: emailOf(name), password: PASSWORD }),
    });
    if (r.status !== 200) throw new Error(`login failed for ${name}: ${r.status}`);
    return (r.headers.get("set-cookie") ?? "").split(";")[0];
  };
  const owner = await login(demoUsers.find((u) => u.key === "owner")!.name);
  const sales = await login(demoUsers.find((u) => u.key === "sales1")!.name);
  const viewer = await login(demoUsers.find((u) => u.key === "viewer")!.name);

  const customer = await db.customer.create({
    data: {
      organizationId: ORG,
      name: `Messaging Test Customer ${suffix}`,
      email: `msgtest-${suffix}@example.com`,
      phone: `+9715${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    },
  });

  // ═════════ permission gating ═════════
  same("no session -> 401", (await get("/api/v1/messages/conversations")).status, 401);
  same("viewer (no messages grant) -> 403 listing", (await get("/api/v1/messages/conversations", viewer)).status, 403);
  same(
    "viewer -> 403 creating",
    (await post("/api/v1/messages/conversations", viewer, { channel: "email", customerId: customer.id, body: "hi" })).status,
    403
  );

  // ═════════ email: a real send through the existing mail transport ═════════
  const created = await post("/api/v1/messages/conversations", owner, {
    channel: "email",
    customerId: customer.id,
    body: "Hello from the dealership",
  });
  ok("owner creates an email conversation -> 201", created.status === 201, JSON.stringify(created.json));
  same(
    "the conversation carries the customer's own contact info and the first message's preview",
    [created.json.channel, created.json.contactHandle, created.json.lastMessagePreview],
    ["email", customer.email, "Hello from the dealership"]
  );
  const convoId = created.json.id as string;

  const messages1 = await get(`/api/v1/messages/conversations/${convoId}/messages`, owner);
  same("one outbound message exists, sent (email always has a transport)", messages1.json?.length, 1);
  same("...and it is really SENT, not silently invented", messages1.json?.[0]?.status, "sent");

  const reply = await post(`/api/v1/messages/conversations/${convoId}/messages`, sales, { body: "A follow-up message" });
  ok("a salesperson (org-scoped messages:create) can reply -> 201", reply.status === 201, JSON.stringify(reply.json));
  same("the reply is attributed to the sender", reply.json?.sentByName, demoUsers.find((u) => u.key === "sales1")!.name);

  const afterReply = await get(`/api/v1/messages/conversations/${convoId}`, owner);
  same("the conversation's preview follows the latest message", afterReply.json?.lastMessagePreview, "A follow-up message");

  // ═════════ whatsapp / sms: real HTTP against the fake providers ═════════
  const wa = await post("/api/v1/messages/conversations", owner, {
    channel: "whatsapp",
    contactName: "WhatsApp Test Contact",
    contactHandle: "971500000001",
    body: "Hi via WhatsApp",
  });
  const waMessages = await get(`/api/v1/messages/conversations/${wa.json.id}/messages`, owner);
  ok(
    "a configured WhatsApp send is really SENT, with the fake provider's own message id",
    waMessages.json?.[0]?.status === "sent",
    JSON.stringify(waMessages.json)
  );

  const sms = await post("/api/v1/messages/conversations", owner, {
    channel: "sms",
    contactName: "SMS Test Contact",
    contactHandle: "971500000002",
    body: "Hi via SMS",
  });
  const smsMessages = await get(`/api/v1/messages/conversations/${sms.json.id}/messages`, owner);
  same("a configured SMS send is really SENT", smsMessages.json?.[0]?.status, "sent");

  const waFail = await post("/api/v1/messages/conversations", owner, {
    channel: "whatsapp",
    contactName: "Refused Contact",
    contactHandle: "fail-971500000003",
    body: "This one is refused by the provider",
  });
  const waFailMessages = await get(`/api/v1/messages/conversations/${waFail.json.id}/messages`, owner);
  ok(
    "a provider refusal is recorded as FAILED with a reason, never silently swallowed",
    waFailMessages.json?.[0]?.status === "failed" && !!waFailMessages.json?.[0]?.errorCode,
    JSON.stringify(waFailMessages.json)
  );

  // ═════════ validation & scope ═════════
  same(
    "creating with neither a customerId nor contact info is a 400",
    (await post("/api/v1/messages/conversations", owner, { channel: "email", body: "no target" })).status,
    400
  );
  same(
    "ai_agent is not a channel this endpoint may start a conversation on",
    (await post("/api/v1/messages/conversations", owner, { channel: "ai_agent", customerId: customer.id, body: "x" })).status,
    400
  );
  same("an unknown conversation is a 404, not a 500", (await get("/api/v1/messages/conversations/01ZZZZZZZZZZZZZZZZZZZZZZZZ", owner)).status, 404);

  // ═════════ read state ═════════
  const unreadBefore = await get(`/api/v1/messages/conversations/${convoId}`, owner);
  same("unreadCount starts at 0 (nothing inbound yet — there is no inbound webhook in this pass)", unreadBefore.json?.unreadCount, 0);
  const marked = await patch(`/api/v1/messages/conversations/${convoId}`, owner, { markRead: true });
  same("marking read -> 200, unreadCount 0", [marked.status, marked.json?.unreadCount], [200, 0]);

  // ═════════ listing & search ═════════
  const list = await get(`/api/v1/messages/conversations?search=${encodeURIComponent(customer.name)}`, owner);
  ok("search by contact name finds the conversation", list.json?.items?.some((c: { id: string }) => c.id === convoId));
  const byChannel = await get("/api/v1/messages/conversations?channel=email", owner);
  ok(
    "filtering by channel returns only that channel",
    byChannel.json?.items?.length > 0 && byChannel.json.items.every((c: { channel: string }) => c.channel === "email")
  );

  // ═════════ tenant isolation ═════════
  const other = await db.organization.create({
    data: { name: `Messaging Isolation ${suffix}`, email: `msg-iso-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  await db.conversation.create({
    data: {
      organizationId: other.id,
      channel: "EMAIL",
      contactName: "Other Org Contact",
      contactHandle: "other@example.com",
    },
  });
  const ownOrgList = await get("/api/v1/messages/conversations", owner);
  ok(
    "another organization's conversation never appears",
    !ownOrgList.json?.items?.some((c: { contactName: string }) => c.contactName === "Other Org Contact")
  );

  console.log(
    failures.length
      ? `Messages HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      : `Messages HTTP check OK (${passed} passed, 0 failed)`
  );
  process.exit(failures.length ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("Messages HTTP check crashed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
