/**
 * End-to-end check of the global search endpoint (§29): GET /api/v1/search. Confirms it genuinely fans out to
 * the real, permission-checked, tenant-scoped `list*` function of each type — never a parallel re-implementation
 * of RBAC — by seeding one token across all 7 real types (Deals is out of scope: no deals module exists, §0.17)
 * and checking who sees what.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:search-http
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
const TOKEN = `Zephyr${suffix}`;
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
async function get(path: string, token?: string): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": `10.91.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` };
  if (token) headers.cookie = `${sessionCookieName()}=${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
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

async function main() {
  const org = await db.organization.create({
    data: { name: `Search Check ${suffix}`, email: `search-check-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const mk = async (roleKey: keyof typeof roles, key: string) => {
    const user = await db.user.create({
      data: { organizationId: org.id, roleId: roles[roleKey], name: key, email: `${key}-${suffix}@example.com`.toLowerCase(), status: "ACTIVE" },
    });
    return { id: user.id, token: (await createSession(db, { organizationId: org.id, userId: user.id })).token };
  };
  const owner = await mk("dealerOwner", "sOwner");
  const viewer = await mk("viewer", "sViewer");
  const other = await mk("dealerOwner", "sOther"); // a second user in the same org, for the AI-conversation privacy check

  const vehicle = await db.vehicle.create({
    data: { organizationId: org.id, stockNumber: `STK-${suffix}`, make: TOKEN, model: "Voyager", year: 2024, listPrice: 120_000 },
  });
  const customer = await db.customer.create({ data: { organizationId: org.id, name: `${TOKEN} Trading LLC`, email: `${suffix}@example.com` } });
  const lead = await db.lead.create({ data: { organizationId: org.id, customerId: customer.id, assignedToId: owner.id } });
  const document = await db.generatedDocument.create({
    data: { organizationId: org.id, type: "QUOTATION", title: `${TOKEN} Quotation`, createdById: owner.id, variables: {}, content: "x" },
  });
  const task = await db.task.create({
    data: { organizationId: org.id, title: `${TOKEN} follow-up`, assignedToId: owner.id, createdById: owner.id, dueAt: new Date(Date.now() + 86_400_000) },
  });
  const conversation = await db.conversation.create({
    data: { organizationId: org.id, channel: "EMAIL", contactName: `${TOKEN} Contact`, contactHandle: `${suffix}@example.com` },
  });
  const ownAiConvo = await db.aiConversation.create({ data: { organizationId: org.id, userId: owner.id, title: `${TOKEN} chat` } });
  const othersAiConvo = await db.aiConversation.create({ data: { organizationId: org.id, userId: other.id, title: `${TOKEN} someone else's chat` } });

  // A second organization's vehicle with the SAME token, to prove tenant isolation.
  const otherOrg = await db.organization.create({
    data: { name: `Search Isolation ${suffix}`, email: `search-iso-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  await db.vehicle.create({
    data: { organizationId: otherOrg.id, stockNumber: `STK-OTHER-${suffix}`, make: TOKEN, model: "Intruder", year: 2024, listPrice: 1 },
  });

  // ═════════ auth ═════════
  same("no session -> 401", (await get(`/api/v1/search?q=${TOKEN}`)).status, 401);
  same("q missing -> 400", (await get("/api/v1/search", owner.token)).status, 400);
  same("q blank after trim -> 400", (await get("/api/v1/search?q=%20%20", owner.token)).status, 400);

  // ═════════ finds every real type, from ONE call, nothing fabricated ═════════
  const full = await get(`/api/v1/search?q=${TOKEN}`, owner.token);
  same("full search -> 200, v2 envelope", [full.status, full.json?.success], [200, true]);
  const byType = full.json?.data?.byType ?? {};
  ok(
    "the owner (holds every permission) sees all 7 real types, none fabricated",
    Object.keys(byType).sort().join(",") === "ai_conversations,customers,documents,leads,messages,tasks,vehicles",
    JSON.stringify(Object.keys(byType))
  );
  same("vehicle result: title, subtitle, link", byType.vehicles?.[0], { id: vehicle.id, title: "2024 Zephyr" + suffix + " Voyager", subtitle: vehicle.stockNumber, link: `/inventory/${vehicle.id}` });
  same("customer result", byType.customers?.[0], { id: customer.id, title: customer.name, subtitle: customer.email, link: `/customers/${customer.id}` });
  same("lead result: title from the joined customer, no separate lead text field needed", byType.leads?.[0], { id: lead.id, title: customer.name, subtitle: null, link: `/leads/${lead.id}` });
  same("document result", byType.documents?.[0], { id: document.id, title: document.title, subtitle: null, link: "/contracts-documents" });
  same("task result: subtitle falls back to the assignee's name (no customer linked)", byType.tasks?.[0], { id: task.id, title: task.title, subtitle: "sOwner", link: "/tasks" });
  same("message/conversation result", byType.messages?.[0], { id: conversation.id, title: conversation.contactName, subtitle: null, link: "/messages" });
  ok(
    "AI conversation result: only the owner's own, never another user's, even in the same org",
    byType.ai_conversations?.length === 1 && byType.ai_conversations[0].id === ownAiConvo.id,
    JSON.stringify(byType.ai_conversations)
  );
  void othersAiConvo;

  ok(
    "another organization's matching vehicle never appears",
    !Object.values(byType)
      .flat()
      .some((r) => (r as { title: string }).title?.includes("Intruder"))
  );

  // ═════════ permission-gated omission: a viewer only reads vehicles ═════════
  const viewerRes = await get(`/api/v1/search?q=${TOKEN}`, viewer.token);
  same("viewer -> 200 (never a 403 for the types it cannot read)", viewerRes.status, 200);
  same(
    "a viewer's response has exactly one type: vehicles — the other 6 are silently omitted, not empty-and-present",
    Object.keys(viewerRes.json.data.byType),
    ["vehicles"]
  );

  // ═════════ filters: which types to search ═════════
  const filtered = await get(`/api/v1/search?q=${TOKEN}&types=customers,leads`, owner.token);
  same("types filter narrows the search to exactly the requested (permitted) types", Object.keys(filtered.json.data.byType).sort(), ["customers", "leads"]);
  const unknownType = await get(`/api/v1/search?q=${TOKEN}&types=vehicles,not_a_real_type`, owner.token);
  same("an unrecognized type in the filter is dropped quietly, not a 400", unknownType.status, 200);
  same("...and the recognized ones still work", Object.keys(unknownType.json.data.byType), ["vehicles"]);

  // ═════════ real pagination and sorting, single-type mode ═════════
  // Created after `vehicle` above, with no explicit createdAt, so it is genuinely the newer of the two.
  const v2 = await db.vehicle.create({
    data: { organizationId: org.id, stockNumber: `STK-${suffix}-2`, make: TOKEN, model: "Ranger", year: 2020, listPrice: 1 },
  });
  const page1 = await get(`/api/v1/search?q=${TOKEN}&types=vehicles&page=1&pageSize=1&sortBy=newest`, owner.token);
  const page2 = await get(`/api/v1/search?q=${TOKEN}&types=vehicles&page=2&pageSize=1&sortBy=newest`, owner.token);
  same("page 1 of 1 (sorted newest first) is the just-created v2... ", page1.json.data.byType.vehicles?.[0]?.id, v2.id);
  same("...and page 2 is the original vehicle", page2.json.data.byType.vehicles?.[0]?.id, vehicle.id);
  const oldestFirst = await get(`/api/v1/search?q=${TOKEN}&types=vehicles&pageSize=1&sortBy=oldest`, owner.token);
  same("sortBy=oldest reverses the order", oldestFirst.json.data.byType.vehicles?.[0]?.id, vehicle.id);

  console.log(
    failures.length
      ? `Search HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      : `Search HTTP check OK (${passed} passed, 0 failed)`
  );
  process.exit(failures.length ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("Search HTTP check crashed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
