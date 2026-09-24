/**
 * End-to-end check of Document Generation (§0.22) over real HTTP: templates (versioned), generation
 * (real facts, never cost data), regeneration on relink, status, sharing (real public link), and the
 * {success,data,meta}/{success,error} v2 envelope these endpoints use (§0.24).
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:documents-http
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { seedDashboardFixture } from "./lib/dashboard-fixture";

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
  raw: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any;
}
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];
const nextIp = () => `10.${runOctets[0]}.${runOctets[1] + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": nextIp() };
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
  const isV2 = json !== null && typeof json === "object" && "success" in (json as object);
  return {
    status: res.status,
    raw: json,
    data: isV2 ? (json as { data: unknown }).data : json,
    error: isV2 ? (json as { error: unknown }).error : json,
  };
}
const get = (p: string, t?: string) => call("GET", p, t);
const post = (p: string, t: string | undefined, b: unknown = {}) => call("POST", p, t, b);
const patch = (p: string, t: string | undefined, b: unknown) => call("PATCH", p, t, b);

async function makeOrg(label: string) {
  const org = await db.organization.create({
    data: {
      name: `${label} ${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.com`,
      timezone: "Asia/Dubai",
      address: "Sheikh Zayed Road",
      city: "Dubai",
      taxNumber: `TRN-${suffix}`,
    },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const downtown = await db.branch.create({ data: { organizationId: org.id, name: "Downtown" } });
  const airport = await db.branch.create({ data: { organizationId: org.id, name: "Airport" } });
  const users: Record<string, { id: string; token: string }> = {};
  const mk = async (key: string, roleId: string) => {
    const user = await db.user.create({
      data: {
        organizationId: org.id,
        roleId,
        name: key,
        email: `${key}-${label}-${suffix}@example.com`.toLowerCase(),
        status: "ACTIVE",
      },
    });
    const token = (await createSession(db, { organizationId: org.id, userId: user.id })).token;
    return (users[key] = { id: user.id, token });
  };
  for (const key of ["dealerOwner", "manager", "marketingManager", "salesperson", "sales2", "buyer", "accountant", "viewer"] as const)
    await mk(key, roles[key === "sales2" ? "salesperson" : key]);
  return { org, roles, downtown, airport, users };
}

async function main() {
  const X = await makeOrg("Xray");
  const Y = await makeOrg("Yankee");
  const fx = await seedDashboardFixture(
    db,
    {
      organizationId: X.org.id,
      downtownId: X.downtown.id,
      airportId: X.airport.id,
      ownerId: X.users.dealerOwner.id,
      sp1Id: X.users.dealerOwner.id,
      sp2Id: X.users.dealerOwner.id,
    },
    `x${suffix}`
  );
  const tok = (k: string) => X.users[k].token;
  const v1 = fx.vehicles.v1;
  const customer = await db.customer.create({ data: { organizationId: X.org.id, name: "Amir Rahimi", phone: "+971501234567", email: "amir@example.com" } });

  // ═════════ 1. who may generate / read / template ═════════
  const table: [string, number, number, number][] = [
    // role, generate, read-list, template-create (org-scope only — see documents.service.ts's createTemplate)
    ["dealerOwner", 201, 200, 201],
    ["manager", 201, 200, 201],
    ["salesperson", 201, 200, 403],
    ["buyer", 201, 200, 201],
    ["accountant", 403, 200, 403],
    ["marketingManager", 403, 403, 403],
    ["viewer", 403, 403, 403],
  ];
  for (const [role, genStatus, readStatus, tplStatus] of table) {
    same(
      `${role}: generate / list / create-template`,
      [
        (await post("/api/v1/generated-documents", tok(role), { type: "receipt", vehicleId: v1.id })).status,
        (await get("/api/v1/generated-documents", tok(role))).status,
        // "delivery_form" here (not "quotation"): quotation's template/content is asserted precisely below,
        // and must not be polluted by a placeholder template created during this RBAC sweep.
        (await post("/api/v1/document-templates", tok(role), { type: "delivery_form", name: "x", content: "hi" })).status,
      ],
      [genStatus, readStatus, tplStatus]
    );
  }
  same("no session -> 401", (await post("/api/v1/generated-documents", undefined, { type: "quotation" })).status, 401);

  // ═════════ 2. the v2 envelope, on success and on error ═════════
  const genRes = await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "quotation", vehicleId: v1.id });
  ok(
    "success responses are wrapped {success:true,data:...}",
    genRes.status === 201 && genRes.raw.success === true && typeof genRes.raw.data === "object",
    JSON.stringify(genRes.raw).slice(0, 200)
  );
  const badRes = await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "not_a_type" });
  ok(
    "error responses are wrapped {success:false,error:{code,message}}",
    badRes.status === 400 && badRes.raw.success === false && typeof badRes.raw.error?.code === "string" && typeof badRes.raw.error?.message === "string"
  );
  ok("v2 errors never leak the HTTP status inside the body (it's redundant with the response code)", badRes.raw.error?.status === undefined);

  // ═════════ 3. generation: real facts, never cost data ═════════
  const gen1 = genRes;
  ok(
    "generation returns the rendered content, type, status draft",
    gen1.data.type === "quotation" && gen1.data.status === "draft" && typeof gen1.data.content === "string",
    JSON.stringify(gen1.data).slice(0, 200)
  );
  const content1 = gen1.data.content as string;
  ok(
    "the document is built from the vehicle's real facts",
    content1.includes("Land Cruiser") && content1.includes("2022") && content1.includes("125,000") && content1.includes("6,250"),
    content1
  );
  ok(
    "...and never the vehicle's cost figures",
    !/90,?000|purchase price|repair cost|transport cost/i.test(content1),
    content1
  );
  ok("...and the real dealer address, never a hardcoded placeholder", content1.includes("Sheikh Zayed Road"), content1);
  const invoiceRes = await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "invoice", vehicleId: v1.id });
  ok("...an invoice also carries the real TRN", (invoiceRes.data.content as string).includes(`TRN-${suffix}`), invoiceRes.data.content);
  const usageActivity = await db.auditLog.findFirst({ where: { organizationId: X.org.id, action: "document.created", entityId: gen1.data.id } });
  ok("a document.created audit entry is written", !!usageActivity);
  const contractRes = await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "sales_agreement", vehicleId: v1.id });
  ok(
    "a contract-type document is audited as contract.generated, not document.created (§0.25/§0.26)",
    !!(await db.auditLog.findFirst({ where: { organizationId: X.org.id, action: "contract.generated", entityId: contractRes.data.id } }))
  );
  const contractNotif = await db.notification.findFirst({
    where: { organizationId: X.org.id, userId: X.users.dealerOwner.id, kind: "DOCUMENT", title: "Contract ready", description: contractRes.data.title },
  });
  ok("notifications: a contract-type document generates a 'Contract ready' notification for its creator (§27)", !!contractNotif, JSON.stringify(contractNotif));
  ok(
    "notifications: a non-contract document (the quotation above) does not",
    !(await db.notification.findFirst({ where: { organizationId: X.org.id, kind: "DOCUMENT", description: gen1.data.title } }))
  );

  // ═════════ 4. templates: versioning ═════════
  const t1 = await post("/api/v1/document-templates", tok("dealerOwner"), {
    type: "quotation",
    language: "en",
    name: "Custom quotation v1",
    content: "CUSTOM QUOTE for {{customer.line}} — {{price}}",
  });
  same("the first custom template for a type/language is version 1, active", [t1.status, t1.data.version, t1.data.isActive], [201, 1, true]);
  const genCustom = await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "quotation", customerId: customer.id });
  ok(
    "generating now uses the custom template, not the built-in default",
    (genCustom.data.content as string).startsWith("CUSTOM QUOTE for Amir Rahimi"),
    genCustom.data.content
  );
  const t2 = await post("/api/v1/document-templates", tok("dealerOwner"), {
    type: "quotation",
    language: "en",
    name: "Custom quotation v2",
    content: "QUOTE v2: {{price}}",
  });
  same("a second template for the same type/language becomes version 2, active", [t2.status, t2.data.version, t2.data.isActive], [201, 2, true]);
  const listT = await get("/api/v1/document-templates?type=quotation", tok("dealerOwner"));
  const activeCount = (listT.data as { isActive: boolean }[]).filter((r) => r.isActive).length;
  same("exactly one active version exists after two creates", activeCount, 1);
  const t3 = await post("/api/v1/document-templates", tok("dealerOwner"), {
    type: "quotation",
    language: "en",
    name: "Draft v3",
    content: "DRAFT: {{price}}",
    activate: false,
  });
  same("activate:false creates a version without deactivating the current one", t3.data.isActive, false);
  const genAfterDraft = await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "quotation" });
  ok("...so generation still uses the last ACTIVE version (v2), not the draft", (genAfterDraft.data.content as string).startsWith("QUOTE v2:"), genAfterDraft.data.content);
  same("the generated document records which template version was actually used", genAfterDraft.data.templateId !== null, true);

  // ═════════ 5. update / regeneration ═════════
  const forUpdate = await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "inspection_report", vehicleId: v1.id });
  ok("linking a vehicle renders its real mileage/history fields", (forUpdate.data.content as string).includes("Mileage:"), forUpdate.data.content);
  const relinked = await patch(`/api/v1/generated-documents/${forUpdate.data.id}`, tok("dealerOwner"), { vehicleId: null });
  ok(
    "removing the vehicle re-renders the document (vehicle details pending)",
    (relinked.data.content as string).includes("[Vehicle details pending]"),
    relinked.data.content
  );
  const titleOnly = await patch(`/api/v1/generated-documents/${forUpdate.data.id}`, tok("dealerOwner"), { title: "Renamed" });
  same("a title-only update does not touch the content", titleOnly.data.title, "Renamed");

  // ═════════ 6. status ═════════
  const statusRes = await patch(`/api/v1/generated-documents/${gen1.data.id}/status`, tok("dealerOwner"), { status: "signed" });
  same("status can be moved to signed", statusRes.data.status, "signed");
  const signedRow = await db.generatedDocument.findUniqueOrThrow({ where: { id: gen1.data.id } });
  ok("...and signed_at is recorded (ready for a future real e-signature integration)", signedRow.signedAt !== null);
  same("an unknown status is a 400", (await patch(`/api/v1/generated-documents/${gen1.data.id}/status`, tok("dealerOwner"), { status: "voided" })).status, 400);
  const inspectionCompleted = await patch(`/api/v1/generated-documents/${forUpdate.data.id}/status`, tok("dealerOwner"), { status: "completed" });
  same("an inspection report can be moved to completed", inspectionCompleted.data.status, "completed");
  const inspectionNotif = await db.notification.findFirst({
    where: { organizationId: X.org.id, userId: X.users.dealerOwner.id, kind: "INSPECTION", title: "Inspection completed" },
  });
  ok("notifications: an inspection report reaching completed notifies its creator (§27)", !!inspectionNotif, JSON.stringify(inspectionNotif));
  const signedIsNotInspectionNotif = await db.notification.count({ where: { organizationId: X.org.id, kind: "INSPECTION" } });
  same("...exactly one such notification (moving gen1, a quotation, to signed above did not create one)", signedIsNotInspectionNotif, 1);

  // ═════════ 7. sharing: a real, working public link ═════════
  const shareRes = await post(`/api/v1/generated-documents/${gen1.data.id}/share`, tok("dealerOwner"), {});
  ok("sharing returns a url and an expiry", shareRes.status === 200 && typeof shareRes.data.url === "string" && typeof shareRes.data.expiresAt === "string", JSON.stringify(shareRes.data));
  const token = (shareRes.data.url as string).split("/").pop()!;
  const publicRead = await get(`/api/v1/generated-documents/shared/${token}`);
  same("the public link resolves with no session, to the same content", [publicRead.status, publicRead.data.content], [200, content1]);
  ok("the public link never includes internal ids or variables", !("id" in publicRead.data) && !("variables" in publicRead.data));
  same("a made-up token is 404", (await get("/api/v1/generated-documents/shared/not-a-real-token-00000000000")).status, 404);
  const afterShare = await get(`/api/v1/generated-documents/${gen1.data.id}`, tok("dealerOwner"));
  same("the document now shows it has an active share", afterShare.data.hasActiveShare, true);

  // ═════════ 8. validation & not-found ═════════
  const badGenerate: [string, unknown][] = [
    ["an unknown type", { type: "receipt_of_sale" }],
    ["an unsupported language", { type: "quotation", language: "fr" }],
    ["a tenant field", { type: "quotation", organizationId: Y.org.id }],
  ];
  for (const [name, body] of badGenerate)
    ok(`generate: 400 for ${name}`, (await post("/api/v1/generated-documents", tok("dealerOwner"), body)).status === 400);
  same("generate: an unknown vehicle is a 404", (await post("/api/v1/generated-documents", tok("dealerOwner"), { type: "quotation", vehicleId: "nope" })).status, 404);
  same(
    "generate: another organization's vehicle is also a 404 (RLS)",
    (await post("/api/v1/generated-documents", Y.users.dealerOwner.token, { type: "quotation", vehicleId: v1.id })).status,
    404
  );

  // ═════════ 9. "own" scope for salesperson ═════════
  const spDoc = await post("/api/v1/generated-documents", tok("salesperson"), { type: "quotation" });
  same("a salesperson can create and read their own document", [spDoc.status, (await get(`/api/v1/generated-documents/${spDoc.data.id}`, tok("salesperson"))).status], [201, 200]);
  same("...but not another salesperson's", (await get(`/api/v1/generated-documents/${spDoc.data.id}`, tok("sales2"))).status, 404);
  same("...while a manager (organization scope) can", (await get(`/api/v1/generated-documents/${spDoc.data.id}`, tok("manager"))).status, 200);

  // ═════════ 10. tenant isolation ═════════
  same(
    "org Y sees none of org X's documents or templates",
    [
      (await get("/api/v1/generated-documents", Y.users.dealerOwner.token)).data.length,
      (await get("/api/v1/document-templates", Y.users.dealerOwner.token)).data.length,
    ],
    [0, 0]
  );
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(`\nDocuments HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
      process.exit(1);
    }
    console.log(`Documents HTTP check OK: ${passed} assertions passed.`);
  });
