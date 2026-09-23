/**
 * End-to-end check of the AI Marketing endpoints (§24) over real HTTP, against a fake of the Anthropic API.
 * Needs, on a THROWAWAY migrated + seeded database:
 *   - fake providers:  tsx scripts/fake-ai-providers.ts 54350
 *   - the app (as the RLS-restricted cda_app role) started with the same AI_* env as scripts/check-ai-http.ts
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:marketing-http
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
const FAKE = process.env.CHECK_FAKE_AI_URL ?? "http://127.0.0.1:54350";

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
  raw: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any, raw };
}
const post = (p: string, t: string | undefined, b: unknown = {}) => call("POST", p, t, b);

const fakeReset = () => fetch(`${FAKE}/__admin/reset`, { method: "POST", body: "{}" });
const fakeLast = async (provider: string) =>
  (await (await fetch(`${FAKE}/__admin/last?provider=${provider}`)).json()) as {
    last: { body: { messages: { role: string; content: string }[]; system?: string } } | null;
  };
const lastUserContent = async (provider = "anthropic") => String((await fakeLast(provider)).last?.body.messages[0]?.content ?? "");

async function makeOrg(label: string) {
  const org = await db.organization.create({
    data: { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com`, timezone: "Asia/Dubai" },
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
  for (const key of ["dealerOwner", "manager", "marketingManager", "salesperson", "buyer", "accountant", "viewer"] as const)
    await mk(key, roles[key]);
  return { org, roles, downtown, airport, users };
}

async function main() {
  await fakeReset();
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

  // ═════════ 1. who may generate / translate ═════════
  const table: [string, number][] = [
    ["dealerOwner", 200],
    ["manager", 200],
    ["marketingManager", 200], // holds marketing:create but NOT vehicles:read — must still work
    ["salesperson", 403],
    ["buyer", 403],
    ["accountant", 403],
    ["viewer", 403],
  ];
  for (const [role, status] of table) {
    same(
      `${role}: generate / translate`,
      [
        (await post("/api/v1/marketing/generate", tok(role), { vehicleId: v1.id, type: "vehicle_ad" })).status,
        (await post("/api/v1/marketing/translate", tok(role), { vehicleId: v1.id, targetLanguage: "ar" })).status,
      ],
      [status, status]
    );
  }
  same(
    "no session -> 401",
    (await post("/api/v1/marketing/generate", undefined, { vehicleId: v1.id, type: "vehicle_ad" })).status,
    401
  );

  // ═════════ 2. generation, end to end ═════════
  await fakeReset();
  const gen = await post("/api/v1/marketing/generate", tok("dealerOwner"), {
    vehicleId: v1.id,
    type: "instagram_caption",
    language: "en",
  });
  ok(
    "generation returns the model's text, type and language",
    gen.status === 200 &&
      gen.json.type === "instagram_caption" &&
      gen.json.language === "en" &&
      gen.json.content.startsWith("[anthropic] echo:") &&
      typeof gen.json.usageId === "string",
    gen.raw.slice(0, 200)
  );
  const prompt1 = await lastUserContent();
  ok(
    "the model is given the vehicle's own recorded facts",
    prompt1.includes("Land Cruiser") && prompt1.includes("2022") && prompt1.includes("125,000"),
    prompt1
  );
  ok(
    "...and never the vehicle's cost figures (no profit:read gate here — costs are simply never sent)",
    !/90,?000|90000|purchase|repair cost|transport cost/i.test(prompt1),
    prompt1
  );
  ok(
    "...and the per-type instruction matches what was asked (Instagram, not a generic ad)",
    prompt1.toLowerCase().includes("instagram"),
    prompt1
  );
  const usageRow = await db.aiUsage.findFirstOrThrow({ where: { id: gen.json.usageId } });
  same(
    "a usage ledger row is written under the marketing_content feature",
    [usageRow.feature, usageRow.status, usageRow.organizationId],
    ["MARKETING_CONTENT", "SUCCESS", X.org.id]
  );
  const activityRow = await db.aiActivity.findFirstOrThrow({ where: { usageId: gen.json.usageId } });
  same(
    "an activity entry is written, tagged with the vehicle, holding no raw content",
    [activityRow.action, activityRow.vehicleId, activityRow.summary.includes("echo")],
    ["MARKETING_CONTENT", v1.id, false]
  );

  // ═════════ 3. inputs: language, price override, features, target audience ═════════
  await fakeReset();
  await post("/api/v1/marketing/generate", tok("dealerOwner"), {
    vehicleId: v1.id,
    type: "email",
    language: "ar",
    priceOverride: 111_000,
    highlightFeatures: ["panoramic sunroof", "extended warranty"],
    targetAudience: "young families",
  });
  const prompt2 = await lastUserContent();
  ok(
    "language, price override, highlight features and target audience all reach the model",
    prompt2.includes("Arabic") &&
      prompt2.includes("111,000") &&
      prompt2.includes("panoramic sunroof") &&
      prompt2.includes("young families") &&
      prompt2.toLowerCase().includes("subject"),
    prompt2
  );

  // ═════════ 4. photos are counted, never analysed ═════════
  await fakeReset();
  const photo = await db.storedFile.create({
    data: {
      organizationId: X.org.id,
      kind: "VEHICLE_PHOTO",
      status: "ACTIVE",
      bucket: "vehicle-photos",
      objectPath: `${X.org.id}/vehicles/${v1.id}/photo-1.jpg`,
      vehicleId: v1.id,
      originalName: "photo-1.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024,
      completedAt: new Date(),
    },
  });
  await post("/api/v1/marketing/generate", tok("dealerOwner"), { vehicleId: v1.id, type: "vehicle_ad" });
  ok("an active photo is counted", (await lastUserContent()).includes("Photos available: 1"));
  await db.storedFile.update({ where: { id: photo.id }, data: { status: "DELETED", deletedAt: new Date() } });
  await fakeReset();
  await post("/api/v1/marketing/generate", tok("dealerOwner"), { vehicleId: v1.id, type: "vehicle_ad" });
  ok("a deleted photo is not counted", (await lastUserContent()).includes("Photos available: 0"));

  // ═════════ 5. validation ═════════
  const badGenerate: [string, unknown][] = [
    ["an unknown content type", { vehicleId: v1.id, type: "youtube_short" }],
    ["an unsupported language", { vehicleId: v1.id, type: "email", language: "fr" }],
    ["no vehicleId", { type: "email" }],
    ["a negative price override", { vehicleId: v1.id, type: "email", priceOverride: -1 }],
    ["a tenant field", { vehicleId: v1.id, type: "email", organizationId: Y.org.id }],
  ];
  for (const [name, body] of badGenerate)
    ok(`generate: 400 for ${name}`, (await post("/api/v1/marketing/generate", tok("dealerOwner"), body)).status === 400);
  same(
    "generate: an unknown vehicle is a 404",
    (await post("/api/v1/marketing/generate", tok("dealerOwner"), { vehicleId: "nope", type: "email" })).status,
    404
  );
  same(
    "generate: another organization's vehicle is also a 404 (RLS)",
    (await post("/api/v1/marketing/generate", Y.users.dealerOwner.token, { vehicleId: v1.id, type: "email" })).status,
    404
  );

  const badTranslate: [string, unknown][] = [
    ["neither vehicleId nor sourceContent", { targetLanguage: "ar" }],
    ["an unsupported target language", { vehicleId: v1.id, targetLanguage: "de" }],
    ["empty sourceContent", { sourceContent: "", targetLanguage: "ar" }],
  ];
  for (const [name, body] of badTranslate)
    ok(`translate: 400 for ${name}`, (await post("/api/v1/marketing/translate", tok("dealerOwner"), body)).status === 400);

  // ═════════ 6. translation: from a vehicle, and from raw text ═════════
  await fakeReset();
  const tr1 = await post("/api/v1/marketing/translate", tok("dealerOwner"), { vehicleId: v1.id, targetLanguage: "fr" });
  ok(
    "translating a vehicle writes a fresh advertisement in the target language",
    tr1.status === 200 && tr1.json.type === "translated_ad" && tr1.json.language === "fr",
    tr1.raw
  );
  ok("...and the model is told which language", (await lastUserContent()).includes("French"));
  const trActivity = await db.aiActivity.findFirstOrThrow({ where: { usageId: tr1.json.usageId } });
  same("...tagged with the vehicle it was written about", trActivity.vehicleId, v1.id);

  await fakeReset();
  const tr2 = await post("/api/v1/marketing/translate", tok("marketingManager"), {
    sourceContent: "Check out this amazing deal! 🚗",
    targetLanguage: "ur",
  });
  ok(
    "translating raw text needs no vehicle at all (marketingManager has no vehicles:read)",
    tr2.status === 200 && tr2.json.language === "ur",
    tr2.raw
  );
  ok("...the original text is passed through to the model", (await lastUserContent()).includes("Check out this amazing deal"));
  const tr2Activity = await db.aiActivity.findFirstOrThrow({ where: { usageId: tr2.json.usageId } });
  ok("...and its activity entry carries no vehicle id", tr2Activity.vehicleId === null);

  // ═════════ 7. tenant isolation ═════════
  await fakeReset();
  const yGen = await post("/api/v1/marketing/generate", Y.users.dealerOwner.token, {
    sourceContent: "irrelevant",
    type: "email",
  });
  void yGen;
  same(
    "org Y sees none of org X's marketing usage",
    await db.aiUsage.count({ where: { organizationId: Y.org.id, feature: "MARKETING_CONTENT" } }),
    0
  );
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nAI Marketing HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`AI Marketing HTTP check OK: ${passed} assertions passed.`);
  });
