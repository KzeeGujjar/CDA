/**
 * Runs the REAL frontend service code (src/services/dashboardService.ts, authService.ts, backend.ts) against the
 * running app, with a fetch that behaves like a browser (relative URLs, cookie jar). Checks the connected dashboard
 * service: demo data without a session, real figures with one (equal to the endpoints' own numbers and to a
 * hand-computed data set), figures a role may not see arriving as null (never 0), the dealership's currency, and the
 * fall-back to demo data when the backend is unreachable.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... npm run check:services-frontend   (app on :3100)
 */
import { createPrismaClient } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { aiInsightsFixture, dealerPerformanceSummaryFixture, analyticsSnapshotFixture } from "@/mock/analytics";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1.");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
if (!/127\.0\.0\.1|localhost/.test(ownerUrl)) throw new Error("Refusing to run against a non-local database.");

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
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
const fails = async (
  fn: () => Promise<unknown>
): Promise<{ message?: string; status?: number; code?: string } | null> =>
  fn().then(
    () => null,
    (e) => e
  );

async function main() {
  const { login, logout } = await import("@/services/authService");
  const { getDealerPerformanceSummary, getAnalyticsSnapshot, getAiInsights } =
    await import("@/services/dashboardService");
  const { backendMode, resetBackendMode } = await import("@/services/backend");

  const suffix = Date.now().toString(36);
  const password = "Services-Check-2026!z";
  const passwordHash = await hashPassword(password);
  const org = await db.organization.create({
    data: { name: `Services ${suffix}`, email: `svc-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const usdOrg = await db.organization.create({
    data: {
      name: `ServicesUsd ${suffix}`,
      email: `svcusd-${suffix}@example.com`,
      timezone: "Asia/Dubai",
      currency: "USD",
    },
  });
  const rolesA = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const rolesB = await db.$transaction((tx) => provisionOrganizationRoles(tx, usdOrg.id));
  const mkUser = async (organizationId: string, roleId: string, key: string) => {
    const email = `${key}-${suffix}@example.com`;
    await db.user.create({
      data: { organizationId, roleId, name: key, email, status: "ACTIVE", passwordHash, emailVerifiedAt: new Date() },
    });
    return email;
  };
  const owner = await mkUser(org.id, rolesA.dealerOwner, "owner");
  const salesperson = await mkUser(org.id, rolesA.salesperson, "salesperson");
  const accountant = await mkUser(org.id, rolesA.accountant, "accountant");
  const marketingManager = await mkUser(org.id, rolesA.marketingManager, "marketingmanager");
  const usdOwner = await mkUser(usdOrg.id, rolesB.dealerOwner, "usdowner");

  // A small data set for THIS month (the dashboard's default period), known by hand.
  const customer = await db.customer.create({ data: { organizationId: org.id, name: "Buyer" } });
  const v = (stock: string, data: Record<string, unknown>) =>
    db.vehicle.create({
      data: {
        organizationId: org.id,
        stockNumber: `${stock}-${suffix}`,
        make: "Toyota",
        model: "Camry",
        year: 2022,
        ...data,
      } as never,
    });
  await v("S1", { listPrice: 100000, purchasePrice: 60000 });
  await v("S2", { listPrice: 50000, expectedSellingPrice: 45000, purchasePrice: 30000, repairCost: 5000 });
  const sold = await v("S3", { listPrice: 80000, purchasePrice: 50000 });
  await db.deal.create({
    data: {
      organizationId: org.id,
      reference: `D-${suffix}`,
      customerId: customer.id,
      vehicleId: sold.id,
      status: "COMPLETED",
      salePrice: 75000,
    },
  });
  await db.lead.create({ data: { organizationId: org.id, customerId: customer.id } });
  await db.lead.create({ data: { organizationId: org.id, customerId: customer.id } });

  // 1. no session: the demo data, exactly as before
  resetBackendMode();
  ok("no session: demo mode", (await backendMode()) === "demo");
  same("...the demo summary", await getDealerPerformanceSummary(), dealerPerformanceSummaryFixture);
  same("...the demo charts", await getAnalyticsSnapshot(), analyticsSnapshotFixture);
  same("...and the demo insights", await getAiInsights(), aiInsightsFixture);

  // 2. dealer owner: real figures
  await login({ email: owner, password });
  const raw = async (path: string) => {
    const r = await fetch(`/api/v1/dashboard/${path}`);
    return { status: r.status, body: r.ok ? await r.json() : null };
  };
  const inv = (await raw("inventory?period=month")).body;
  const sal = (await raw("sales?period=month")).body;
  const led = (await raw("leads?period=month")).body;
  const summary = await getDealerPerformanceSummary();
  ok("live mode with a session", (await backendMode()) === "live");
  same(
    "the vehicles sold, monthly sales and gross profit are the hand-computed figures",
    [summary.vehiclesSold, summary.monthlySales, summary.grossProfit],
    [1, 75000, 25000]
  );
  same("new leads", summary.newLeads, 2);
  same("expected revenue (stock on hand: 100,000 list + 45,000 expected)", summary.expectedRevenue, 145000);
  same("inventory value at cost (60,000 + 35,000)", summary.totalInventoryValue, 95000);
  same(
    "every KPI equals what the endpoints returned, and its change",
    [
      [summary.totalVehicles, summary.totalVehiclesDelta, inv.totalVehicles.value, inv.totalVehicles.change],
      [
        summary.availableVehicles,
        summary.availableVehiclesDelta,
        inv.availableVehicles.value,
        inv.availableVehicles.change,
      ],
      [
        summary.vehiclesPurchased,
        summary.vehiclesPurchasedDelta,
        inv.vehiclesPurchased.value,
        inv.vehiclesPurchased.change,
      ],
      [
        summary.totalInventoryValue,
        summary.totalInventoryValueDelta,
        inv.inventoryValue.value,
        inv.inventoryValue.change,
      ],
      [summary.expectedRevenue, summary.expectedRevenueDelta, inv.expectedRevenue.value, inv.expectedRevenue.change],
      [summary.vehiclesSold, summary.vehiclesSoldDelta, sal.vehiclesSold.value, sal.vehiclesSold.change],
      [summary.monthlySales, summary.monthlySalesDelta, sal.monthlySales.value, sal.monthlySales.change],
      [summary.grossProfit, summary.grossProfitDelta, sal.grossProfit.value, sal.grossProfit.change],
      [summary.newLeads, summary.newLeadsDelta, led.newLeads.value, led.newLeads.change],
      [summary.conversionRate, summary.conversionRateDelta, led.conversionRate.value, led.conversionRate.change],
    ].map(([a, b]) => [a, b]),
    [
      [inv.totalVehicles.value, inv.totalVehicles.change],
      [inv.availableVehicles.value, inv.availableVehicles.change],
      [inv.vehiclesPurchased.value, inv.vehiclesPurchased.change],
      [inv.inventoryValue.value, inv.inventoryValue.change],
      [inv.expectedRevenue.value, inv.expectedRevenue.change],
      [sal.vehiclesSold.value, sal.vehiclesSold.change],
      [sal.monthlySales.value, sal.monthlySales.change],
      [sal.grossProfit.value, sal.grossProfit.change],
      [led.newLeads.value, led.newLeads.change],
      [led.conversionRate.value, led.conversionRate.change],
    ]
  );
  same("the dealership's currency comes with the figures", summary.currency, "AED");
  ok(
    "no demo number leaks into the live summary",
    summary.totalVehicles !== dealerPerformanceSummaryFixture.totalVehicles ||
      summary.monthlySales !== dealerPerformanceSummaryFixture.monthlySales
  );

  const snapshot = await getAnalyticsSnapshot();
  const trend = (await (await fetch("/api/v1/dashboard/sales-trend?months=6")).json()) as {
    months: { month: string; revenue: number }[];
  };
  const thisMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "Asia/Dubai" }).format(new Date());
  same(
    "the sales trend: 6 months, this month last with 75,000",
    [snapshot.salesTrend.length, snapshot.salesTrend.at(-1)],
    [6, { label: thisMonth, value: 75000 }]
  );
  same(
    "...each point is the endpoint's revenue",
    snapshot.salesTrend.map((p) => p.value),
    trend.months.map((m) => m.revenue)
  );
  same(
    "what the backend still does not provide is empty, not invented",
    [snapshot.leadFunnel, snapshot.revenueByMake, snapshot.topPerformers],
    [[], [], []]
  );
  const summaryRaw = (await raw("summary?period=month")).body as {
    inventoryAging: { label: string; value: number }[];
    aiInsights: unknown[];
  };
  same(
    "inventoryAging and aiInsights are real now (§0.20): match the summary endpoint exactly",
    [snapshot.inventoryAging, await getAiInsights()],
    [summaryRaw.inventoryAging, summaryRaw.aiInsights]
  );

  // 3. a role that may not see costs: those figures are null, the rest is real
  await logout();
  await login({ email: salesperson, password });
  const spSummary = await getDealerPerformanceSummary();
  const spInv = await raw("inventory?period=month");
  const spSales = await raw("sales?period=month");
  ok(
    "salesperson: cost and profit figures are null (never 0)",
    spSummary.totalInventoryValue === null &&
      spSummary.grossProfit === null &&
      spSummary.totalInventoryValueDelta === null,
    JSON.stringify(spSummary)
  );
  ok(
    "...the figures they may see are present",
    spInv.status === 200 &&
      spSales.status === 200 &&
      spSummary.monthlySales !== null &&
      spSummary.totalVehicles !== null
  );

  // 4. a role that may not read some endpoints: those figures are null, the rest still load
  await logout();
  await login({ email: accountant, password });
  const acc = {
    inv: await raw("inventory?period=month"),
    sal: await raw("sales?period=month"),
    led: await raw("leads?period=month"),
  };
  // §0.20: the composed /dashboard/summary endpoint never 403s for a signed-in user — a slice the role may
  // not read is null instead, decided by the route itself rather than by the frontend probing three endpoints
  // and inferring a 403 from all three failing.
  const accSummary = await getDealerPerformanceSummary();
  ok(
    "accountant: an endpoint the role may not read leaves its figures null, the others load",
    (acc.inv.status === 403) === (accSummary.totalVehicles === null) &&
      (acc.sal.status === 403) === (accSummary.monthlySales === null) &&
      (acc.led.status === 403) === (accSummary.newLeads === null),
    JSON.stringify({ statuses: [acc.inv.status, acc.sal.status, acc.led.status], accSummary })
  );

  await logout();
  await login({ email: marketingManager, password });
  const mkt = await getDealerPerformanceSummary();
  ok(
    "marketing manager: none of vehicles/sales/leads:read -> every figure is null, but no thrown error",
    mkt.totalVehicles === null && mkt.monthlySales === null && mkt.newLeads === null,
    JSON.stringify(mkt)
  );

  // 5. another dealership, another currency
  await logout();
  await login({ email: usdOwner, password });
  const usd = await getDealerPerformanceSummary();
  same(
    "a USD dealership's figures say USD and show none of the other dealership's data",
    [usd.currency, usd.monthlySales, usd.vehiclesSold, usd.newLeads],
    ["USD", 0, 0, 0]
  );

  // 6. sign-out and an unreachable backend fall back to the demo data
  await logout();
  same("after sign-out: demo data again", await getDealerPerformanceSummary(), dealerPerformanceSummaryFixture);
  await login({ email: owner, password });
  ok("live again after signing back in", (await backendMode()) === "live");
  await db.session.updateMany({ where: { organizationId: org.id }, data: { revokedAt: new Date() } });
  const expired = await fails(() => getDealerPerformanceSummary());
  same("a session that expired mid-use is a 401 the page can show", expired?.status, 401);
  same(
    "...and the next call is demo data",
    [(await backendMode()) === "demo", (await getDealerPerformanceSummary()).totalVehicles],
    [true, dealerPerformanceSummaryFixture.totalVehicles]
  );
  jar.clear();
  base = "http://127.0.0.1:9";
  resetBackendMode();
  same("nothing listening: demo data", await getDealerPerformanceSummary(), dealerPerformanceSummaryFixture);
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nServices frontend check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Services frontend check OK: ${passed} assertions passed.`);
  });
