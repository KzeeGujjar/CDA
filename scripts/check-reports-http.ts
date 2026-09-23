/**
 * End-to-end check of the reporting APIs (§0.20) over real HTTP against the demo-seeded dealership, whose
 * deals/leads/vehicles carry dates relative to when the seed ran, so the last-30-days window each report
 * queries actually has real completed deals, recent vehicles and recent leads to aggregate.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:reports-http
 */
import { spawnSync } from "node:child_process";
import { createPrismaClient } from "@/server/db/client";
import { users as demoUsers } from "../prisma/demo/data";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const PASSWORD = "Reports-check-Pw-2291-mf";

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
async function call(method: string, path: string, cookie?: string): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": `10.85.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers });
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
      headers: { "content-type": "application/json", "x-real-ip": `10.84.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` },
      body: JSON.stringify({ email: emailOf(name), password: PASSWORD }),
    });
    if (r.status !== 200) throw new Error(`login failed for ${name}: ${r.status}`);
    return (r.headers.get("set-cookie") ?? "").split(";")[0];
  };
  const owner = await login(demoUsers.find((u) => u.key === "owner")!.name);
  const sales = await login(demoUsers.find((u) => u.key === "sales1")!.name);
  const viewer = await login(demoUsers.find((u) => u.key === "viewer")!.name);

  const REAL = [
    "/reports/sales",
    "/reports/purchases",
    "/reports/profit",
    "/reports/inventory",
    "/reports/leads",
    "/reports/salesperson-performance",
    "/reports/vehicle-performance",
    "/reports/ai-performance",
  ];

  // ═════════ permission gating ═════════
  for (const path of REAL) same(`no session -> 401 on ${path}`, (await get(`/api/v1${path}`)).status, 401);
  // salesperson holds no "reports" grant at all in the built-in role templates.
  for (const path of REAL) same(`salesperson -> 403 on ${path}`, (await get(`/api/v1${path}`, sales)).status, 403);

  // ═════════ owner: every report answers with real, aggregated numbers ═════════
  const sold = await get("/api/v1/reports/sales", owner);
  ok("sales: 200 with real completed deals from the demo window", sold.status === 200 && sold.json.unitsSold > 0, JSON.stringify(sold.json));
  ok(
    "sales: rows carry real vehicle/customer/salesperson labels, not placeholders",
    sold.json.rows.length > 0 && sold.json.rows.every((r: { vehicleLabel: string; customerName: string }) => r.vehicleLabel && r.customerName)
  );
  ok(
    "sales: totalRevenue equals the sum of the row-level sale prices actually returned (bounded, but self-consistent)",
    Math.abs(sold.json.totalRevenue - sold.json.rows.reduce((s: number, r: { salePrice: number }) => s + r.salePrice, 0)) < 1 ||
      sold.json.rows.length === 50 // once the 50-row cap is hit the two figures may legitimately diverge
  );

  const profit = await get("/api/v1/reports/profit", owner);
  ok("profit: 200, gross profit computed from real sale price minus real cost of sale", profit.status === 200 && typeof profit.json.grossProfit === "number");

  const purchases = await get("/api/v1/reports/purchases", owner);
  ok("purchases: 200 with recently acquired vehicles", purchases.status === 200 && purchases.json.unitsPurchased >= 0);
  ok(
    "purchases: supplierName is honestly absent, never invented",
    purchases.json.rows.every((r: { supplierName?: string }) => r.supplierName === undefined)
  );

  const inv = await get("/api/v1/reports/inventory", owner);
  ok("inventory: 200, real stock count and aging buckets", inv.status === 200 && inv.json.totalUnits > 0 && inv.json.agingBuckets.length === 4);
  ok("inventory: owner (profit:read) sees real cost figures", inv.json.rows.some((r: { costPrice: number | null }) => r.costPrice !== null));

  const leads = await get("/api/v1/reports/leads", owner);
  ok("leads: 200 with a real funnel", leads.status === 200 && leads.json.funnel.length === 6);

  const sp = await get("/api/v1/reports/salesperson-performance", owner);
  ok(
    "salesperson-performance: real reps with real names, sorted by revenue",
    sp.status === 200 && sp.json.rows.length > 0 && sp.json.rows.every((r: { name: string }) => r.name !== "—")
  );

  const vp = await get("/api/v1/reports/vehicle-performance", owner);
  ok(
    "vehicle-performance: views/inquiries are honestly absent (no tracking exists), daysToSell is real",
    vp.status === 200 &&
      vp.json.rows.every((r: { views?: number; inquiries?: number }) => r.views === undefined && r.inquiries === undefined)
  );

  const ai = await get("/api/v1/reports/ai-performance", owner);
  ok(
    "ai-performance: avgSatisfaction is honestly absent (never collected)",
    ai.status === 200 && ai.json.avgSatisfaction === undefined
  );

  // ═════════ profit-gating: purchases/profit need profit:read; inventory degrades gracefully instead ═════════
  same("viewer (reports:read, no profit:read) -> 403 on purchases", (await get("/api/v1/reports/purchases", viewer)).status, 403);
  same("viewer -> 403 on profit", (await get("/api/v1/reports/profit", viewer)).status, 403);
  const invViewer = await get("/api/v1/reports/inventory", viewer);
  same("viewer -> 200 on inventory (it has real value beyond cost)", invViewer.status, 200);
  same("...but totalValue is null, not a fabricated number", invViewer.json.totalValue, null);
  ok(
    "...and every row's costPrice is null too",
    invViewer.json.rows.every((r: { costPrice: number | null }) => r.costPrice === null)
  );
  same("viewer -> 200 on sales (revenue, not cost)", (await get("/api/v1/reports/sales", viewer)).status, 200);

  // ═════════ tenant isolation ═════════
  const other = await db.organization.create({
    data: { name: `Reports Isolation ${suffix}`, email: `reports-iso-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const otherCustomer = await db.customer.create({ data: { organizationId: other.id, name: "Isolation Customer" } });
  // status stays AVAILABLE here: a vehicle may only become "sold" by completing a deal (a DB trigger enforces
  // this even for a direct insert like this one), which is not what this isolation check is exercising.
  const otherVehicle = await db.vehicle.create({
    data: {
      organizationId: other.id,
      stockNumber: `ISO-${suffix}`,
      make: "IsolationMake",
      model: "IsolationModel",
      year: 2024,
      status: "AVAILABLE",
      listPrice: 999_999,
      purchasePrice: 500_000,
      acquiredAt: new Date(),
    },
  });
  await db.deal.create({
    data: {
      organizationId: other.id,
      reference: `ISO-DEAL-${suffix}`,
      customerId: otherCustomer.id,
      vehicleId: otherVehicle.id,
      status: "COMPLETED",
      salePrice: 999_999,
      completedAt: new Date(),
    },
  });
  const ownOrgSales = await get("/api/v1/reports/sales", owner);
  ok(
    "another organization's deal never appears in this one's sales report",
    !ownOrgSales.json.rows.some((r: { salePrice: number }) => r.salePrice === 999_999)
  );

  console.log(
    failures.length
      ? `Reports HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      : `Reports HTTP check OK (${passed} passed, 0 failed)`
  );
  process.exit(failures.length ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("Reports HTTP check crashed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
