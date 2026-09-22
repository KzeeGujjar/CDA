/**
 * Checks the demo seed (prisma/seed-demo.ts). Run with `npm run check:demo-seed` against a RUNNING app (started
 * as the RLS-restricted `cda_app` role, COOKIE_SECURE=false) on a THROWAWAY migrated + base-seeded database
 * (`npm run db:seed` done; this script writes and deletes demo data):
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:demo-seed
 *
 * Proves: the seed refuses to run without opt-in, in production, with a weak password; it is idempotent; --reset
 * rebuilds only the demo records and is atomic; the volumes asked for exist; the data is fictional and in AED;
 * the records agree with each other (sold vehicles, won leads, links, AI answers quote true figures); the
 * runtime role sees exactly its own organization; and the demo users can sign in and read the data over HTTP.
 */
import { spawnSync } from "node:child_process";
import { createPrismaClient } from "@/server/db/client";
import { runInTenant } from "@/server/db/tenant";
import { verifyPassword } from "@/server/auth/password";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { customers, DEMO_ORGANIZATION_ID, users } from "../prisma/demo/data";
import { aed, checkDigit } from "../prisma/demo/derive";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1")
  throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes and deletes demo data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const ORG = DEMO_ORGANIZATION_ID;
const TEST_PASSWORD = "Demo-check-Pw-9187-xq";
const DAY = 86_400_000;

const db = createPrismaClient(ownerUrl, { maxConnections: 3 });
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, actual: unknown, expected: unknown) =>
  ok(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
  );

function seed(env: Record<string, string | undefined>, ...args: string[]) {
  const r = spawnSync("npx", ["tsx", "prisma/seed-demo.ts", ...args], {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DIRECT_DATABASE_URL: ownerUrl, ...env },
  });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}
const GOOD = { ALLOW_DEMO_SEED: "1", DEMO_USER_PASSWORD: TEST_PASSWORD };

const dubaiDay = (d: Date) => Math.floor((d.getTime() + 4 * 3_600_000) / DAY);

async function counts() {
  const w = { organizationId: ORG };
  return {
    users: await db.user.count({ where: w }),
    customers: await db.customer.count({ where: w }),
    vehicles: await db.vehicle.count({ where: w }),
    leads: await db.lead.count({ where: w }),
    deals: await db.deal.count({ where: w }),
    tasks: await db.task.count({ where: w }),
    notifications: await db.notification.count({ where: w }),
    aiConversations: await db.aiConversation.count({ where: w }),
    aiMessages: await db.aiMessage.count({ where: w }),
  };
}

async function main() {
  // ───────────── A. guards ─────────────
  const orgBefore = await db.organization.findUnique({ where: { id: ORG }, select: { id: true } });
  const snapshot = orgBefore ? await counts() : null;
  for (const [name, env, expected] of [
    ["without ALLOW_DEMO_SEED", { ALLOW_DEMO_SEED: undefined, DEMO_USER_PASSWORD: TEST_PASSWORD }, "ALLOW_DEMO_SEED"],
    ["in production", { ...GOOD, NODE_ENV: "production" }, "production"],
    ["with a weak DEMO_USER_PASSWORD", { ALLOW_DEMO_SEED: "1", DEMO_USER_PASSWORD: "password123" }, "not acceptable"],
    ["without DIRECT_DATABASE_URL", { ...GOOD, DIRECT_DATABASE_URL: "" }, "DIRECT_DATABASE_URL"],
  ] as const) {
    const r = seed(env as Record<string, string | undefined>);
    ok(
      `refuses ${name}`,
      r.code === 1 && r.out.includes("refused") && r.out.includes(expected),
      `${r.code} ${r.out.slice(0, 200)}`
    );
  }
  if (snapshot) same("a refused run changes nothing", await counts(), snapshot);

  // ───────────── B. first run (rebuild first if a previous run left the demo organization behind) ─────────────
  const first = seed(GOOD, ...(orgBefore ? ["--reset"] : []));
  ok("seeds successfully", first.code === 0, first.out.slice(-400));
  ok("never prints a password that was supplied", !first.out.includes(TEST_PASSWORD));
  const c = await counts();
  ok("30+ vehicles", c.vehicles >= 30, String(c.vehicles));
  ok("15+ customers", c.customers >= 15, String(c.customers));
  ok("20+ leads", c.leads >= 20, String(c.leads));
  ok("deals", c.deals >= 10, String(c.deals));
  ok("tasks", c.tasks >= 15, String(c.tasks));
  ok("notifications", c.notifications >= 10, String(c.notifications));
  ok("AI conversations", c.aiConversations >= 5 && c.aiMessages >= 10, JSON.stringify(c));
  same("users", c.users, users.length);
  same("customers match the data file", c.customers, customers.length);

  // ───────────── C. fictional and in AED ─────────────
  const org = await db.organization.findUniqueOrThrow({ where: { id: ORG } });
  same(
    "organization is a UAE dealership in AED",
    [org.country, org.currency, org.timezone, org.emirate],
    ["AE", "AED", "Asia/Dubai", "DUBAI"]
  );
  const userRows = await db.user.findMany({ where: { organizationId: ORG }, include: { role: true } });
  const custRows = await db.customer.findMany({ where: { organizationId: ORG } });
  ok(
    "every e-mail is on a reserved .example domain",
    [...userRows, ...custRows, org].every((r) => /@[a-z0-9-]+\.example$/.test(r.email ?? ""))
  );
  ok(
    "every phone is in an unassigned 000 block",
    [...userRows, ...custRows].every((r) => /^\+971 (50|52|55|56) 000 \d{4}$/.test(r.phone ?? ""))
  );
  ok(
    "branch phones are in the 000 block",
    (await db.branch.findMany({ where: { organizationId: ORG } })).every((b) =>
      /^\+971 \d 000 \d{4}$/.test(b.phone ?? "")
    )
  );
  same("customer names are unique", new Set(custRows.map((r) => r.name)).size, custRows.length);

  const vehicles = await db.vehicle.findMany({ where: { organizationId: ORG } });
  ok(
    "VINs: 17 characters, valid check digit, unique, visibly synthetic",
    vehicles.every((v) => {
      const vin = v.vin ?? "";
      return vin.length === 17 && vin.includes("D3M0X") && checkDigit(vin.slice(0, 8) + "0" + vin.slice(9)) === vin[8];
    }) && new Set(vehicles.map((v) => v.vin)).size === vehicles.length
  );
  ok("stock numbers are unique", new Set(vehicles.map((v) => v.stockNumber)).size === vehicles.length);
  ok(
    "every price is a positive AED amount",
    vehicles.every((v) => Number(v.listPrice) > 0 && Number(v.purchasePrice) > 0 && Number(v.listPrice) < 5_000_000)
  );
  ok(
    "purchases in a foreign currency are USD at the 3.6725 peg",
    vehicles.every(
      (v) => v.purchaseCurrency === null || (v.purchaseCurrency === "USD" && Number(v.purchaseFxRate) === 3.6725)
    )
  );
  ok(
    "some vehicles were bought in USD",
    vehicles.some((v) => v.purchaseCurrency === "USD")
  );
  ok(
    "vehicles span several emirates and specifications",
    new Set(vehicles.map((v) => v.emirate)).size >= 5 && new Set(vehicles.map((v) => v.importSpec)).size === 3
  );
  ok(
    "every vehicle status is represented sensibly",
    ["AVAILABLE", "RESERVED", "SOLD", "IN_TRANSIT", "UNDER_INSPECTION", "UNDER_REPAIR", "PURCHASED"].every((s) =>
      vehicles.some((v) => v.status === s)
    )
  );
  ok(
    "most vehicles have a positive margin at list price",
    vehicles.filter(
      (v) => Number(v.listPrice) > Number(v.purchasePrice) + Number(v.repairCost) + Number(v.transportCost)
    ).length >=
      vehicles.length - 1
  );

  // ───────────── D. the records agree with each other ─────────────
  const deals = await db.deal.findMany({ where: { organizationId: ORG } });
  const leads = await db.lead.findMany({ where: { organizationId: ORG } });
  const completed = deals.filter((d) => d.status === "COMPLETED");
  const sold = vehicles.filter((v) => v.status === "SOLD");
  same(
    "sold vehicles are exactly the vehicles of completed deals",
    sold.map((v) => v.id).sort(),
    completed.map((d) => d.vehicleId).sort()
  );
  ok(
    "a completed deal carries the cost snapshot and a date after acquisition",
    completed.every((d) => {
      const v = vehicles.find((x) => x.id === d.vehicleId)!;
      return (
        Number(d.costOfSale) === Number(v.purchasePrice) + Number(v.repairCost) + Number(v.transportCost) &&
        d.completedAt !== null &&
        d.completedAt >= v.acquiredAt &&
        d.completedAt <= new Date()
      );
    })
  );
  ok(
    "sales happened over several months (a trend to show)",
    new Set(completed.map((d) => d.completedAt!.toISOString().slice(0, 7))).size >= 4
  );
  ok(
    "VAT is 5% of the price",
    deals.every((d) => Math.abs(Number(d.vatAmount) - Number(d.salePrice) * 0.05) < 0.01)
  );
  ok(
    "deal references are unique and formatted QT-year-number",
    new Set(deals.map((d) => d.reference)).size === deals.length &&
      deals.every((d) => /^QT-\d{4}-\d{4}$/.test(d.reference))
  );
  ok(
    "every deal status is represented",
    ["DRAFT", "SENT", "ACCEPTED", "CONVERTED_TO_CONTRACT", "COMPLETED", "DECLINED", "CANCELLED"].every((s) =>
      deals.some((d) => d.status === s)
    )
  );
  ok(
    "deals were created before they were completed",
    completed.every((d) => d.createdAt <= d.completedAt!)
  );

  const pair = (customerId: string, vehicleId: string) => `${customerId}|${vehicleId}`;
  const won = leads.filter((l) => l.stage === "WON");
  same(
    "won leads are exactly the customers who completed a purchase",
    won.map((l) => pair(l.customerId, l.interestedVehicleId!)).sort(),
    completed.map((d) => pair(d.customerId, d.vehicleId)).sort()
  );
  ok(
    "every lead stage is represented",
    ["NEW", "CONTACTED", "QUALIFIED", "VIEWING", "NEGOTIATION", "WON", "LOST"].every((s) =>
      leads.some((l) => l.stage === s)
    )
  );
  ok(
    "every lead source is represented",
    ["WEBSITE", "WALK_IN", "REFERRAL", "SOCIAL_MEDIA", "MARKETPLACE", "PHONE"].every((s) =>
      leads.some((l) => l.source === s)
    )
  );
  ok(
    "open leads have a follow-up date, closed ones do not",
    leads.every((l) => ["WON", "LOST"].includes(l.stage) === (l.nextFollowUpAt === null))
  );
  ok(
    "only leads never contacted are stage NEW",
    leads.every((l) => (l.stage === "NEW") === (l.lastContactAt === null))
  );
  ok(
    "nothing dated in the future that already happened",
    leads.every(
      (l) =>
        l.createdAt <= new Date() &&
        (l.lastContactAt ?? l.createdAt) <= new Date() &&
        (l.lastContactAt ?? l.createdAt) >= l.createdAt
    )
  );
  const firstLead = new Map<string, Date>();
  for (const l of leads)
    if (!firstLead.has(l.customerId) || l.createdAt < firstLead.get(l.customerId)!)
      firstLead.set(l.customerId, l.createdAt);
  ok(
    "a customer exists before their first lead",
    custRows.every((cu) => !firstLead.has(cu.id) || cu.createdAt <= firstLead.get(cu.id)!)
  );
  ok(
    "every customer has at least one lead",
    custRows.every((cu) => firstLead.has(cu.id))
  );
  ok(
    "leads have a score in range and a budget in AED",
    leads.every((l) => l.score >= 0 && l.score <= 100 && Number(l.budget) > 0)
  );

  const tasks = await db.task.findMany({ where: { organizationId: ORG } });
  ok(
    "completed tasks carry a completion time, open ones do not",
    tasks.every((t) => (t.status === "COMPLETED") === (t.completedAt !== null))
  );
  ok(
    "there are open, completed, overdue and due-today tasks",
    tasks.some((t) => t.status === "COMPLETED") &&
      tasks.some((t) => t.status === "OPEN" && t.dueAt < new Date()) &&
      tasks.some((t) => t.status === "OPEN" && dubaiDay(t.dueAt) === dubaiDay(new Date()))
  );
  ok(
    "some tasks were created by the AI agent",
    tasks.some((t) => t.source === "ai_agent")
  );
  ok(
    "every task is assigned",
    tasks.every((t) => t.assignedToId !== null)
  );
  ok(
    "tasks are not completed before they were created",
    tasks.every((t) => t.completedAt === null || t.completedAt >= t.createdAt)
  );

  const notes = await db.notification.findMany({ where: { organizationId: ORG } });
  const ids = {
    leads: new Set(leads.map((l) => l.id)),
    deals: new Set(deals.map((d) => d.id)),
    inventory: new Set(vehicles.map((v) => v.id)),
  };
  const staticPaths = new Set(["/leads", "/tasks", "/ai-assistant", "/contracts-documents"]);
  ok(
    "every notification link points at a real record or page",
    notes.every((n) => {
      if (n.link === null) return true;
      if (staticPaths.has(n.link)) return true;
      const m = /^\/(leads|deals|inventory)\/([^/]+)$/.exec(n.link);
      return !!m && ids[m[1] as keyof typeof ids].has(m[2]);
    })
  );
  ok(
    "notifications: read and unread, several kinds, several users",
    notes.some((n) => n.readAt) &&
      notes.some((n) => !n.readAt) &&
      new Set(notes.map((n) => n.kind)).size >= 6 &&
      new Set(notes.map((n) => n.userId)).size >= 4
  );
  ok(
    "notifications are not dated in the future, and read after they arrived",
    notes.every(
      (n) => n.createdAt <= new Date() && (n.readAt === null || (n.readAt >= n.createdAt && n.readAt <= new Date()))
    )
  );

  const conversations = await db.aiConversation.findMany({
    where: { organizationId: ORG },
    include: { messages: { orderBy: { position: "asc" } } },
  });
  ok(
    "conversations: contiguous positions, user first, alternating, count matches",
    conversations.every(
      (cv) =>
        cv.messageCount === cv.messages.length &&
        cv.messages.every((m, i) => m.position === i + 1 && m.role === (i % 2 === 0 ? "USER" : "ASSISTANT"))
    )
  );
  ok(
    "no conversation claims a provider or model, and no usage was invented",
    conversations.every((cv) => cv.messages.every((m) => m.provider === null && m.model === null)) &&
      (await db.aiUsage.count({ where: { organizationId: ORG } })) === 0
  );
  ok(
    "conversations are about a record, at most one",
    conversations.every((cv) => [cv.vehicleId, cv.customerId, cv.leadId, cv.dealId].filter(Boolean).length <= 1) &&
      conversations.some((cv) => cv.leadId) &&
      conversations.some((cv) => cv.vehicleId) &&
      conversations.some((cv) => cv.dealId)
  );
  ok(
    "one conversation is in Arabic",
    conversations.some((cv) => /[؀-ۿ]/.test(cv.title))
  );
  ok("more than one user has conversations", new Set(conversations.map((cv) => cv.userId)).size >= 4);

  // The figures the AI quotes must be true for this data.
  const text = (title: string) =>
    conversations
      .find((cv) => cv.title === title)
      ?.messages.map((m) => m.content)
      .join("\n") ?? "";
  const today = dubaiDay(new Date());
  const unsold = vehicles
    .filter((v) => v.status !== "SOLD")
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
  const aging = text("Aging inventory review");
  ok(
    "aging answer lists the true three oldest vehicles and their days",
    unsold
      .slice(0, 3)
      .every((v) =>
        aging.includes(`${v.year} ${v.make} ${v.model} ${v.trim}: ${today - dubaiDay(v.acquiredAt)} days in stock`)
      ),
    aging.slice(0, 300)
  );
  const open = leads.filter((l) => l.stage !== "WON" && l.stage !== "LOST");
  const stageCount = (s: string) => leads.filter((l) => l.stage === s).length;
  ok(
    "pipeline answer quotes the true counts",
    text("Pipeline summary").includes(
      `${open.length} open leads: ${stageCount("NEW")} new, ${stageCount("CONTACTED")} contacted, ${stageCount("QUALIFIED")} qualified, ${stageCount("VIEWING")} viewing and ${stageCount("NEGOTIATION")} in negotiation`
    ),
    text("Pipeline summary").slice(0, 200)
  );
  const rrsDeal = deals.find(
    (d) => d.status === "DRAFT" && vehicles.find((v) => v.id === d.vehicleId)?.model === "Sport"
  )!;
  const rrs = vehicles.find((v) => v.id === rrsDeal.vehicleId)!;
  const rrsMargin =
    Number(rrsDeal.salePrice) - (Number(rrs.purchasePrice) + Number(rrs.repairCost) + Number(rrs.transportCost));
  ok(
    "margin answer quotes the true margin",
    text("Margin on the Range Rover Sport quotation").includes(`margin is ${aed(rrsMargin)}`),
    text("Margin on the Range Rover Sport quotation")
  );
  const availableCount = unsold.filter((v) => v.status === "AVAILABLE").length;
  ok(
    "Arabic summary quotes the true inventory counts",
    text("ملخص المخزون الأسبوعي").includes(`لدينا ${unsold.length} مركبة`) &&
      text("ملخص المخزون الأسبوعي").includes(`${availableCount} متاحة`)
  );

  // ───────────── E. passwords and roles ─────────────
  const hashOk = await Promise.all(userRows.map((u) => verifyPassword(u.passwordHash ?? "", TEST_PASSWORD)));
  ok(
    "every demo user's hash verifies the password (and it is Argon2id)",
    hashOk.every(Boolean) && userRows.every((u) => u.passwordHash!.startsWith("$argon2id$"))
  );
  ok(
    "no two users share a hash (each is salted)",
    new Set(userRows.map((u) => u.passwordHash)).size === userRows.length
  );
  ok(
    "users are active, verified and not locked",
    userRows.every((u) => u.status === "ACTIVE" && u.emailVerifiedAt && !u.lockedUntil)
  );
  same(
    "each user has the intended role",
    userRows.map((u) => `${u.name}:${u.role.key}`).sort(),
    users.map((u) => `${u.name}:${u.role}`).sort()
  );

  // ───────────── F. the runtime role sees its own organization, and only that ─────────────
  const control = await db.organization.create({
    data: { name: `Demo control ${Date.now().toString(36)}`, email: `control-${Date.now().toString(36)}@example.com` },
  });
  await db.$transaction((tx) => provisionOrganizationRoles(tx, control.id));
  await db.customer.create({ data: { organizationId: control.id, name: "Control Customer" } });
  const controlBefore = await db.customer.count({ where: { organizationId: control.id } });
  const asApp = (orgId: string) =>
    runInTenant(
      db,
      orgId,
      async (tx) => ({
        vehicles: await tx.vehicle.count(),
        customers: await tx.customer.count(),
        leads: await tx.lead.count(),
        deals: await tx.deal.count(),
        tasks: await tx.task.count(),
        notifications: await tx.notification.count(),
        conversations: await tx.aiConversation.count(),
      }),
      { assumeRole: "cda_app" }
    );
  same("cda_app sees every demo record of its organization", await asApp(ORG), {
    vehicles: c.vehicles,
    customers: c.customers,
    leads: c.leads,
    deals: c.deals,
    tasks: c.tasks,
    notifications: c.notifications,
    conversations: c.aiConversations,
  });
  same("another organization sees none of it", await asApp(control.id), {
    vehicles: 0,
    customers: 1,
    leads: 0,
    deals: 0,
    tasks: 0,
    notifications: 0,
    conversations: 0,
  });
  const noTenant = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
    return tx.$queryRawUnsafe<{ n: number }[]>("SELECT count(*)::int AS n FROM notifications");
  });
  same("without a tenant set, the runtime role sees no notifications", noTenant[0].n, 0);

  // ───────────── G. idempotent, reset, atomic ─────────────
  const ids1 = (
    await db.vehicle.findMany({ where: { organizationId: ORG }, select: { id: true }, orderBy: { stockNumber: "asc" } })
  ).map((v) => v.id);
  const userIds1 = userRows.map((u) => u.id).sort();
  const again = seed(GOOD);
  ok(
    "a second run says it is already there and exits cleanly",
    again.code === 0 && again.out.includes("already exists"),
    again.out.slice(-300)
  );
  same("a second run changes nothing", await counts(), c);
  same(
    "a second run keeps the same vehicle rows",
    (
      await db.vehicle.findMany({
        where: { organizationId: ORG },
        select: { id: true },
        orderBy: { stockNumber: "asc" },
      })
    ).map((v) => v.id),
    ids1
  );

  const reset = seed(GOOD, "--reset");
  ok("--reset succeeds", reset.code === 0, reset.out.slice(-400));
  ok("--reset reports what it removed", reset.out.includes("Removed the previous demo records"));
  same("--reset restores the same volumes", await counts(), c);
  const ids2 = (
    await db.vehicle.findMany({ where: { organizationId: ORG }, select: { id: true }, orderBy: { stockNumber: "asc" } })
  ).map((v) => v.id);
  ok(
    "--reset rebuilds the demo records",
    ids2.every((id) => !ids1.includes(id))
  );
  same(
    "--reset keeps the users",
    (await db.user.findMany({ where: { organizationId: ORG }, select: { id: true } })).map((u) => u.id).sort(),
    userIds1
  );
  same(
    "--reset does not touch another organization",
    await db.customer.count({ where: { organizationId: control.id } }),
    controlBefore
  );
  ok(
    "after --reset the sold vehicles are sold again (through their deals)",
    (await db.vehicle.count({ where: { organizationId: ORG, status: "SOLD" } })) === sold.length
  );
  const events = await db.vehicleStatusEvent.count({ where: { organizationId: ORG, toStatus: "SOLD" } });
  same("after --reset each sale has exactly one 'sold' history event", events, sold.length);

  // A file attached to a demo vehicle blocks the reset; the reset must then change NOTHING.
  const someVehicle = ids2[0];
  const file = await db.storedFile.create({
    data: {
      organizationId: ORG,
      kind: "VEHICLE_PHOTO",
      status: "ACTIVE",
      bucket: "vehicle-photos",
      objectPath: `${ORG}/vehicles/${someVehicle}/check.jpg`,
      vehicleId: someVehicle,
      originalName: "check.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
      completedAt: new Date(),
    },
  });
  const blocked = seed(GOOD, "--reset");
  ok(
    "a reset blocked by an attached file fails with a clear message",
    blocked.code === 1 && blocked.out.includes("could not be replaced"),
    blocked.out.slice(-300)
  );
  same("a failed reset is atomic: nothing changed", await counts(), c);
  same(
    "a failed reset keeps the same vehicle rows",
    (
      await db.vehicle.findMany({
        where: { organizationId: ORG },
        select: { id: true },
        orderBy: { stockNumber: "asc" },
      })
    ).map((v) => v.id),
    ids2
  );
  await db.storedFile.delete({ where: { id: file.id } });

  // ───────────── H. over HTTP, as the demo users ─────────────
  let ip = 0;
  const call = async (path: string, init: RequestInit = {}, cookie?: string) => {
    const headers: Record<string, string> = {
      "x-real-ip": `10.77.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}`,
      ...(init.headers as Record<string, string>),
    };
    if (cookie) headers.cookie = cookie;
    if (init.body) headers["content-type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, { ...init, headers });
    const raw = await res.text();
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      json = JSON.parse(raw);
    } catch {
      /* not json */
    }
    return { status: res.status, json, raw, res };
  };
  const signIn = async (email: string, password = TEST_PASSWORD) => {
    const r = await call("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    const cookie = (r.res.headers.get("set-cookie") ?? "").split(";")[0];
    return { ...r, cookie };
  };
  const emailOf = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@desertfalcon-demo.example`;
  const session: Record<string, string> = {};
  for (const u of users) {
    const r = await signIn(emailOf(u.name));
    ok(
      `${u.role} (${u.name}) can sign in`,
      r.status === 200 && r.json?.organization?.id === ORG && r.cookie.includes("="),
      `${r.status} ${r.raw.slice(0, 120)}`
    );
    ok(`${u.name}: the response has no token or hash`, !/passwordHash|argon2|token/i.test(r.raw));
    session[u.key] = r.cookie;
  }
  same("a wrong password is refused", (await signIn(emailOf("Saeed Al Marri"), "Wrong-password-1234")).status, 401);

  const trend = await call("/api/v1/dashboard/sales-trend?months=6", {}, session.owner);
  ok("owner: sales trend loads in AED", trend.status === 200 && trend.json.currency === "AED", trend.raw.slice(0, 200));
  same(
    "owner: the trend adds up to every completed sale",
    trend.json?.months?.reduce((s: number, m: { vehiclesSold: number }) => s + m.vehiclesSold, 0),
    completed.length
  );
  same(
    "owner: the trend revenue equals the sum of sale prices",
    Math.round(trend.json?.months?.reduce((s: number, m: { revenue: number }) => s + m.revenue, 0)),
    Math.round(completed.reduce((s, d) => s + Number(d.salePrice), 0))
  );
  const profit = trend.json?.months?.reduce((s: number, m: { grossProfit: number }) => s + m.grossProfit, 0);
  same(
    "owner: gross profit equals sale price minus the cost snapshot",
    Math.round(profit),
    Math.round(completed.reduce((s, d) => s + Number(d.salePrice) - Number(d.costOfSale), 0))
  );
  const inv = await call("/api/v1/dashboard/inventory?period=month", {}, session.owner);
  ok("owner: inventory KPIs load", inv.status === 200 && inv.json.currency === "AED", inv.raw.slice(0, 200));
  ok(
    "owner: available vehicles is the true count",
    inv.json?.availableVehicles?.value === availableCount,
    `${inv.json?.availableVehicles?.value} vs ${availableCount}`
  );
  ok("owner: leads KPIs load", (await call("/api/v1/dashboard/leads?period=month", {}, session.owner)).status === 200);
  ok(
    "salesperson: sees only their own deals in the trend",
    (await call("/api/v1/dashboard/sales-trend?months=6", {}, session.sales1)).json?.months?.reduce(
      (s: number, m: { vehiclesSold: number }) => s + m.vehiclesSold,
      0
    ) ===
      completed.filter(
        (d) => d.salespersonId === userRows.find((u) => u.role.key === "salesperson" && u.name === "Yousef Karim")!.id
      ).length
  );

  const conversationsFor = async (key: string) => (await call("/api/v1/ai/conversations", {}, session[key])).json;
  const expected: Record<string, number> = { owner: 2, manager: 1, sales1: 1, sales2: 1, marketing: 1 };
  for (const [key, n] of Object.entries(expected)) {
    const r = await conversationsFor(key);
    same(`${key}: sees exactly their own ${n} conversation(s) over the API`, r?.total, n);
  }
  const ownerList = await conversationsFor("owner");
  const ownerConv = await call(`/api/v1/ai/conversations/${ownerList.items[0].id}`, {}, session.owner);
  ok(
    "owner: a conversation opens with its messages",
    ownerConv.status === 200 &&
      ownerConv.json.messages.length === ownerConv.json.messageCount &&
      ownerConv.json.messages.length >= 2
  );
  same(
    "another user cannot open it (404, not 403)",
    (await call(`/api/v1/ai/conversations/${ownerList.items[0].id}`, {}, session.manager)).status,
    404
  );
  const ctxConv = (await conversationsFor("sales1")).items[0];
  same("a lead-context conversation exposes its context", ctxConv.context?.type, "lead");
  same("the viewer role has no AI access", (await call("/api/v1/ai/conversations", {}, session.viewer)).status, 403);
  const viewerInv = await call("/api/v1/dashboard/inventory?period=month", {}, session.viewer);
  ok(
    "the read-only viewer can read the inventory dashboard, without cost figures",
    viewerInv.status === 200 &&
      viewerInv.json?.inventoryValue === null &&
      viewerInv.json?.availableVehicles?.value === availableCount,
    viewerInv.raw.slice(0, 200)
  );
  same(
    "the viewer cannot read leads",
    (await call("/api/v1/dashboard/leads?period=month", {}, session.viewer)).status,
    403
  );

  // cleanup: the control organization is not part of the demo
  await db.customer.deleteMany({ where: { organizationId: control.id } });
}

main()
  .then(async () => {
    console.log(`demo seed checks: ${passed} passed, ${failures.length} failed`);
    if (failures.length) {
      for (const f of failures) console.log(`  FAIL: ${f}`);
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
