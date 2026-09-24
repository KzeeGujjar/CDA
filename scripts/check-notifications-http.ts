/**
 * End-to-end check of the notifications API (§27): GET/PATCH/read-all over real HTTP (own-data only, never
 * another user's or another organization's), and the lead follow-up reminder job. The real TRIGGERS for the
 * other notification kinds (new lead, vehicle price change, contract ready, inspection completed, AI
 * opportunity) are tested alongside the module that fires them (check-crm-http.ts, check-documents-http.ts,
 * check-ai-agent-http.ts) rather than duplicated here.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:notifications-http
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { runLeadFollowUpReminders } from "@/server/platform/lead-follow-up-reminders";

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
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}
let ip = 0;
async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": `10.89.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` };
  if (token) headers.cookie = `${sessionCookieName()}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // no body
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any };
}
const get = (p: string, t?: string) => call("GET", p, t);
const patch = (p: string, t: string | undefined, b: unknown) => call("PATCH", p, t, b);
const post = (p: string, t: string | undefined, b?: unknown) => call("POST", p, t, b);

async function main() {
  const org = await db.organization.create({
    data: { name: `Notifications Check ${suffix}`, email: `notif-check-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const mk = async (key: string) => {
    const user = await db.user.create({
      data: { organizationId: org.id, roleId: roles.dealerOwner, name: key, email: `${key}-${suffix}@example.com`.toLowerCase(), status: "ACTIVE" },
    });
    return { id: user.id, token: (await createSession(db, { organizationId: org.id, userId: user.id })).token };
  };
  const a = await mk("nA");
  const b = await mk("nB");

  const otherOrg = await db.organization.create({
    data: { name: `Notifications Other ${suffix}`, email: `notif-other-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const otherRoles = await db.$transaction((tx) => provisionOrganizationRoles(tx, otherOrg.id));
  const other = await (async () => {
    const user = await db.user.create({
      data: { organizationId: otherOrg.id, roleId: otherRoles.dealerOwner, name: "nO", email: `nO-${suffix}@example.com`.toLowerCase(), status: "ACTIVE" },
    });
    return { id: user.id, token: (await createSession(db, { organizationId: otherOrg.id, userId: user.id })).token };
  })();

  // ═════════ no session ═════════
  same("no session -> 401 listing", (await get("/api/v1/notifications")).status, 401);
  same("no session -> 401 marking read", (await patch("/api/v1/notifications/x", undefined, { read: true })).status, 401);
  same("no session -> 401 marking all read", (await post("/api/v1/notifications/read-all", undefined)).status, 401);

  // ═════════ seed one read and one unread notification each, for A and B ═════════
  const mkNotif = async (userId: string, title: string, readAt: Date | null) =>
    db.notification.create({
      data: { organizationId: org.id, userId, kind: "SYSTEM", title, description: "d", link: "/tasks", readAt },
    });
  const aUnread = await mkNotif(a.id, "A unread", null);
  const aRead = await mkNotif(a.id, "A read", new Date());
  const bUnread = await mkNotif(b.id, "B unread", null);

  // ═════════ listing: own notifications only, v2 envelope, shape ═════════
  const listA = await get("/api/v1/notifications", a.token);
  same("A's list -> 200", listA.status, 200);
  ok("A's list carries a v2 envelope", listA.json?.success === true && Array.isArray(listA.json.data));
  const ids: string[] = listA.json.data.map((n: { id: string }) => n.id);
  ok("A sees exactly A's two notifications, none of B's", ids.includes(aUnread.id) && ids.includes(aRead.id) && !ids.includes(bUnread.id));
  const unreadRow = listA.json.data.find((n: { id: string }) => n.id === aUnread.id);
  const readRow = listA.json.data.find((n: { id: string }) => n.id === aRead.id);
  same("read reflects readAt (unread)", unreadRow?.read, false);
  same("read reflects readAt (already read)", readRow?.read, true);
  same("kind comes back lowercase", unreadRow?.kind, "system");
  same("link is carried through", unreadRow?.link, "/tasks");

  // ═════════ marking read: ownership, idempotency, validation ═════════
  const markOwn = await patch(`/api/v1/notifications/${aUnread.id}`, a.token, { read: true });
  same("marking your own unread notification -> 200, read:true", [markOwn.status, markOwn.json?.data?.read], [200, true]);
  const markAgain = await patch(`/api/v1/notifications/${aUnread.id}`, a.token, { read: true });
  same("marking an already-read one again -> 200, idempotent", [markAgain.status, markAgain.json?.data?.read], [200, true]);
  same(
    "marking someone else's notification -> 404, not 403 (never reveal it exists)",
    (await patch(`/api/v1/notifications/${bUnread.id}`, a.token, { read: true })).status,
    404
  );
  same("an unknown id -> 404", (await patch("/api/v1/notifications/01ZZZZZZZZZZZZZZZZZZZZZZZZ", a.token, { read: true })).status, 404);
  same("{read:false} is rejected (the only legal value is true)", (await patch(`/api/v1/notifications/${aUnread.id}`, a.token, { read: false })).status, 400);
  same(
    "another organization's user cannot even find A's notification",
    (await patch(`/api/v1/notifications/${aUnread.id}`, other.token, { read: true })).status,
    404
  );

  // ═════════ mark all read ═════════
  const moreUnread = await mkNotif(a.id, "A unread 2", null);
  const readAll = await post("/api/v1/notifications/read-all", a.token);
  ok("mark-all-read -> 200, updated count includes the fresh unread one", readAll.status === 200 && readAll.json?.data?.updated >= 1, JSON.stringify(readAll.json));
  const afterAll = await get("/api/v1/notifications", a.token);
  ok("...and every one of A's notifications is now read", afterAll.json.data.every((n: { read: boolean }) => n.read));
  const bStillUnread = await db.notification.findUniqueOrThrow({ where: { id: bUnread.id } });
  ok("...but B's is untouched", bStillUnread.readAt === null);
  ok("mark-all-read with nothing left to mark -> 200, updated 0", (await post("/api/v1/notifications/read-all", a.token)).json?.data?.updated === 0);
  void moreUnread;

  // ═════════ lead follow-up reminders (§27): a real job, mirrors task reminders ═════════
  const customer = await db.customer.create({ data: { organizationId: org.id, name: `Follow-up Customer ${suffix}`, email: `fu-${suffix}@example.com` } });
  const dueLead = await db.lead.create({
    data: { organizationId: org.id, customerId: customer.id, assignedToId: a.id, nextFollowUpAt: new Date(Date.now() - 60_000) },
  });
  const notDueLead = await db.lead.create({
    data: { organizationId: org.id, customerId: customer.id, assignedToId: a.id, nextFollowUpAt: new Date(Date.now() + 3_600_000) },
  });
  const beforeCount = await db.notification.count({ where: { organizationId: org.id, userId: a.id } });
  const run1 = await runLeadFollowUpReminders();
  ok("the follow-up run reminds at least the one due lead", run1.reminded >= 1);
  const afterCount = await db.notification.count({ where: { organizationId: org.id, userId: a.id } });
  ok("...creating a real notification row", afterCount > beforeCount);
  const followUpNotif = await db.notification.findFirst({ where: { organizationId: org.id, kind: "LEAD", title: "Follow-up reminder", description: customer.name } });
  same("...addressed to the lead's assignee, naming the customer", followUpNotif?.userId, a.id);
  const notDueRow = await db.lead.findUniqueOrThrow({ where: { id: notDueLead.id } });
  ok("a lead not yet due is left alone", notDueRow.followUpRemindedAt === null);
  const run2 = await runLeadFollowUpReminders();
  const dueLeadRow2 = await db.lead.findUniqueOrThrow({ where: { id: dueLead.id } });
  ok("running again does not double-remind the same lead (followUpRemindedAt was stamped)", dueLeadRow2.followUpRemindedAt !== null);
  void run2;

  // Rescheduling resets the gate, via the real PUT /api/v1/leads/:id endpoint.
  const reschedule = await call("PUT", `/api/v1/leads/${dueLead.id}`, a.token, { nextFollowUpAt: new Date(Date.now() - 30_000).toISOString() });
  ok("rescheduling a lead's follow-up -> 200", reschedule.status === 200, JSON.stringify(reschedule.json));
  const rescheduledRow = await db.lead.findUniqueOrThrow({ where: { id: dueLead.id } });
  ok("...resets followUpRemindedAt, so a new due date gets its own reminder", rescheduledRow.followUpRemindedAt === null);
  const beforeCount2 = await db.notification.count({ where: { organizationId: org.id, userId: a.id } });
  await runLeadFollowUpReminders();
  const afterCount2 = await db.notification.count({ where: { organizationId: org.id, userId: a.id } });
  ok("...and the rescheduled lead is reminded again", afterCount2 > beforeCount2);

  console.log(
    failures.length
      ? `Notifications HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      : `Notifications HTTP check OK (${passed} passed, 0 failed)`
  );
  process.exit(failures.length ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("Notifications HTTP check crashed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
