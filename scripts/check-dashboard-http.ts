/**
 * End-to-end check of the four dashboard endpoints over real HTTP. Run with `npm run check:dashboard`
 * against a RUNNING app (started as the RLS-restricted `cda_app` role, COOKIE_SECURE=false) on a
 * THROWAWAY migrated + seeded database (writes test data):
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:dashboard
 *
 * Verifies, per role: who may call what, which figures are withheld (cost and profit need profit:read),
 * that own/branch scopes narrow the numbers, that another tenant is invisible, and that bad input is a 400.
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { at, seedDashboardFixture } from "./lib/dashboard-fixture";

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
const same = (name: string, actual: unknown, expected: unknown) =>
  ok(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
  );

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  raw: string;
  headers: Headers;
}
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];
const nextIp = () => `10.${runOctets[0]}.${runOctets[1] + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function get(path: string, token?: string): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": nextIp() };
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
  return { status: res.status, json: json as any, raw, headers: res.headers };
}

async function makeOrg(label: string) {
  const org = await db.organization.create({
    data: { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const downtown = await db.branch.create({ data: { organizationId: org.id, name: "Downtown" } });
  const airport = await db.branch.create({ data: { organizationId: org.id, name: "Airport" } });
  const users: Record<string, { id: string; token: string }> = {};
  const mk = async (key: string, roleId: string, branchIds: string[] = []) => {
    const user = await db.user.create({
      data: {
        organizationId: org.id,
        roleId,
        name: key,
        email: `${key}-${label}-${suffix}@example.com`.toLowerCase(),
        status: "ACTIVE",
      },
    });
    for (const branchId of branchIds)
      await db.userBranch.create({ data: { userId: user.id, branchId, organizationId: org.id } });
    const token = (await createSession(db, { organizationId: org.id, userId: user.id })).token;
    return (users[key] = { id: user.id, token });
  };
  for (const key of [
    "dealerOwner",
    "manager",
    "salesperson",
    "buyer",
    "accountant",
    "marketingManager",
    "viewer",
  ] as const)
    await mk(key, roles[key], key === "salesperson" ? [downtown.id] : []);
  await mk("sales2", roles.salesperson, [airport.id]);
  return { org, roles, downtown, airport, users, mk };
}

const WINDOW_QS = "period=custom&from=2026-03-01&to=2026-03-31";
const now = new Date();
const monthsSinceFeb2026 = (now.getUTCFullYear() - 2026) * 12 + now.getUTCMonth();
const m = (metric: { value: number | null; previous: number | null }) => [metric.value, metric.previous];

async function main() {
  const X = await makeOrg("Xray");
  const Y = await makeOrg("Yankee");
  const refs = {
    organizationId: X.org.id,
    downtownId: X.downtown.id,
    airportId: X.airport.id,
    ownerId: X.users.dealerOwner.id,
    sp1Id: X.users.salesperson.id,
    sp2Id: X.users.sales2.id,
  };
  await seedDashboardFixture(db, refs, `x${suffix}`);
  // Yankee has one vehicle only: totals differ from Xray's, so any mix-up is visible.
  await db.vehicle.create({
    data: {
      organizationId: Y.org.id,
      stockNumber: `Y1-${suffix}`,
      make: "Nissan",
      model: "Patrol",
      year: 2021,
      listPrice: 200_000,
      purchasePrice: 150_000,
      acquiredAt: at("2026-03-05"),
    },
  });

  const tok = (k: string) => X.users[k].token;
  const paths = {
    inventory: `/api/v1/dashboard/inventory?${WINDOW_QS}`,
    sales: `/api/v1/dashboard/sales?${WINDOW_QS}`,
    leads: `/api/v1/dashboard/leads?${WINDOW_QS}`,
    trend: `/api/v1/dashboard/sales-trend?months=${monthsSinceFeb2026}`,
  };

  // ═════════ 1. who may call what, and what is withheld ═════════
  // [inventory, sales, leads, trend] status per role; then whether cost/profit figures are present.
  const matrix: Record<
    string,
    { status: [number, number, number, number]; cost: boolean; profit: boolean; scope: string }
  > = {
    dealerOwner: { status: [200, 200, 200, 200], cost: true, profit: true, scope: "organization" },
    manager: { status: [200, 200, 200, 200], cost: true, profit: true, scope: "organization" },
    salesperson: { status: [200, 200, 200, 200], cost: false, profit: false, scope: "organization" },
    buyer: { status: [200, 403, 403, 403], cost: true, profit: false, scope: "organization" },
    accountant: { status: [403, 200, 403, 200], cost: false, profit: true, scope: "organization" },
    marketingManager: { status: [403, 403, 403, 403], cost: false, profit: false, scope: "" },
    viewer: { status: [200, 403, 403, 403], cost: false, profit: false, scope: "organization" },
  };
  for (const [role, want] of Object.entries(matrix)) {
    const res = await Promise.all(Object.values(paths).map((p) => get(p, tok(role))));
    same(
      `${role}: inventory/sales/leads/trend statuses`,
      res.map((r) => r.status),
      want.status
    );
    const [inv, sal, , trend] = res;
    if (inv.status === 200) {
      ok(
        `${role}: inventory value (cost) ${want.cost ? "is" : "is NOT"} present`,
        want.cost ? inv.json.inventoryValue !== null : inv.json.inventoryValue === null
      );
      ok(
        `${role}: the response never mentions costs when it is withheld`,
        want.cost || !/cost|inventoryValue":\{/i.test(inv.raw)
      );
      ok(`${role}: inventory scope is "${want.scope}"`, inv.json.scope === want.scope);
    }
    if (sal.status === 200) {
      ok(
        `${role}: gross profit ${want.profit ? "is" : "is NOT"} present`,
        want.profit ? sal.json.grossProfit !== null : sal.json.grossProfit === null
      );
    }
    if (trend.status === 200) {
      ok(
        `${role}: monthly profit ${want.profit ? "is" : "is NOT"} present`,
        trend.json.months.every((r: { grossProfit: number | null }) =>
          want.profit ? r.grossProfit !== null : r.grossProfit === null
        )
      );
    }
    for (const r of res.filter((x) => x.status === 403))
      ok(`${role}: a 403 uses the standard error body`, r.json?.code === "forbidden");
  }
  same(
    "no session -> 401 on every endpoint",
    (await Promise.all(Object.values(paths).map((p) => get(p)))).map((r) => r.status),
    [401, 401, 401, 401]
  );
  const noStore = await get(paths.inventory, tok("dealerOwner"));
  ok("dashboard responses are never cached", noStore.headers.get("cache-control") === "no-store");

  // ═════════ 2. the numbers over HTTP (owner sees the whole organization) ═════════
  const inv = (await get(paths.inventory, tok("dealerOwner"))).json;
  same("total vehicles", m(inv.totalVehicles), [7, 4]);
  same("available vehicles", m(inv.availableVehicles), [3, 3]);
  same("vehicles purchased", m(inv.vehiclesPurchased), [3, 2]);
  same("expected revenue", m(inv.expectedRevenue), [335_000, 345_000]);
  same("inventory value (cost)", m(inv.inventoryValue), [260_000, 270_000]);
  same(
    "change: +75% vehicles, 0% available, +50% purchased",
    [inv.totalVehicles.change, inv.availableVehicles.change, inv.vehiclesPurchased.change],
    [75, 0, 50]
  );
  same(
    "change: expected revenue -2.9%, inventory value -3.7%",
    [inv.expectedRevenue.change, inv.inventoryValue.change],
    [-2.9, -3.7]
  );
  ok(
    "the period is reported in ISO time, Dubai midnight to Dubai midnight",
    inv.period.from === "2026-02-28T20:00:00.000Z" &&
      inv.period.to === "2026-03-31T20:00:00.000Z" &&
      inv.period.timezone === "Asia/Dubai" &&
      inv.currency === "AED"
  );
  ok(
    "the comparison period is the equal-length span before",
    inv.period.previousTo === inv.period.from && inv.period.previousFrom === "2026-01-28T20:00:00.000Z"
  );

  const sal = (await get(paths.sales, tok("dealerOwner"))).json;
  same("vehicles sold", m(sal.vehiclesSold), [2, 1]);
  same("monthly sales (revenue)", m(sal.monthlySales), [207_000, 75_000]);
  same("gross profit", m(sal.grossProfit), [47_000, 15_000]);
  same(
    "change: sold +100%, revenue +176%, profit +213.3%",
    [sal.vehiclesSold.change, sal.monthlySales.change, sal.grossProfit.change],
    [100, 176, 213.3]
  );

  const led = (await get(paths.leads, tok("dealerOwner"))).json;
  same("new leads", m(led.newLeads), [4, 3]);
  same("won leads", m(led.wonLeads), [2, 1]);
  same("conversion rate", m(led.conversionRate), [50, 33.33]);
  same(
    "conversion rate change is in percentage points (16.7), not percent",
    [led.conversionRate.change, led.conversionRate.changeUnit],
    [16.7, "points"]
  );

  const tr = (await get(paths.trend, tok("dealerOwner"))).json;
  const trByMonth = Object.fromEntries(tr.months.map((r: { month: string }) => [r.month.slice(0, 7), r]));
  ok(
    "trend: N months, oldest first, zero-filled",
    tr.months.length === monthsSinceFeb2026 && tr.months[0].month === "2026-02-01" && trByMonth["2026-04"].revenue === 0
  );
  same(
    "trend: Mar 2026",
    [trByMonth["2026-03"].vehiclesSold, trByMonth["2026-03"].revenue, trByMonth["2026-03"].grossProfit],
    [2, 207_000, 47_000]
  );
  ok(
    "trend: the May 31 21:00Z sale falls in June (Dubai time)",
    trByMonth["2026-06"].vehiclesSold === 1 && trByMonth["2026-05"].vehiclesSold === 0
  );
  const month = (await get("/api/v1/dashboard/inventory", tok("dealerOwner"))).json;
  ok(
    "default period is the current month",
    month.period.preset === "month" && new Date(month.period.from) < new Date(month.period.to)
  );

  // ═════════ 3. scopes ═════════
  const spSales = (await get(paths.sales, tok("salesperson"))).json;
  same(
    "own scope: a salesperson sees only their sales (revenue)",
    [m(spSales.monthlySales), spSales.scope],
    [[52_000, 75_000], "own"]
  );
  same("own scope: ...and count", m(spSales.vehiclesSold), [1, 1]);
  const sp2Sales = (await get(paths.sales, tok("sales2"))).json;
  same("own scope: another salesperson sees only theirs", m(sp2Sales.monthlySales), [155_000, 0]);
  const spLeads = (await get(paths.leads, tok("salesperson"))).json;
  same(
    "own scope: leads assigned to me",
    [m(spLeads.newLeads), m(spLeads.conversionRate)],
    [
      [2, 2],
      [50, 50],
    ]
  );
  const spTrend = (await get(paths.trend, tok("salesperson"))).json;
  same(
    "own scope: monthly trend only has my sales",
    spTrend.months
      .filter((r: { revenue: number }) => r.revenue > 0)
      .map((r: { month: string; revenue: number }) => [r.month.slice(0, 7), r.revenue]),
    [
      ["2026-02", 75_000],
      ["2026-03", 52_000],
      ["2026-06", 25_000],
    ]
  );
  const spInv = (await get(paths.inventory, tok("salesperson"))).json;
  same("a salesperson sees the whole stock (vehicles:read is organization-wide)", m(spInv.totalVehicles), [7, 4]);

  // A custom role with BRANCH scope, assigned to Airport only; and one with the same role but no branch at all.
  const permId = async (key: string) => (await db.permission.findUniqueOrThrow({ where: { key } })).id;
  const branchRole = await db.role.create({
    data: { organizationId: X.org.id, key: `branch_analyst_${suffix}`, name: "Branch analyst", rank: 20 },
  });
  for (const key of ["vehicles:read", "sales:read", "leads:read"])
    await db.rolePermission.create({
      data: { roleId: branchRole.id, organizationId: X.org.id, permissionId: await permId(key), scope: "BRANCH" },
    });
  const airportUser = await X.mk("airportAnalyst", branchRole.id, [X.airport.id]);
  const lonelyUser = await X.mk("lonelyAnalyst", branchRole.id, []);
  const brSales = (await get(paths.sales, airportUser.token)).json;
  same(
    "branch scope: only the Airport branch's sales",
    [m(brSales.monthlySales), brSales.scope],
    [[155_000, 0], "branch"]
  );
  const brInv = (await get(paths.inventory, airportUser.token)).json;
  same(
    "branch scope: only the Airport branch's vehicles",
    [m(brInv.totalVehicles), brInv.inventoryValue],
    [[2, 1], null]
  );
  const brLeads = (await get(paths.leads, airportUser.token)).json;
  same(
    "branch scope: only the Airport branch's leads",
    [m(brLeads.newLeads), m(brLeads.conversionRate)],
    [
      [2, 1],
      [50, 0],
    ]
  );
  const loneSales = (await get(paths.sales, lonelyUser.token)).json;
  const loneInv = (await get(paths.inventory, lonelyUser.token)).json;
  same(
    "branch scope with NO branch assigned fails closed: nothing",
    [m(loneSales.monthlySales), m(loneInv.totalVehicles), m((await get(paths.leads, lonelyUser.token)).json.newLeads)],
    [
      [0, 0],
      [0, 0],
      [0, 0],
    ]
  );

  // ═════════ 4. other tenants ═════════
  const yInv = (await get(paths.inventory, Y.users.dealerOwner.token)).json;
  same(
    "tenant Y sees only its own single vehicle",
    [m(yInv.totalVehicles), m(yInv.inventoryValue)],
    [
      [1, 0],
      [150_000, 0],
    ]
  );
  const ySales = (await get(paths.sales, Y.users.dealerOwner.token)).json;
  same(
    "tenant Y sees none of tenant X's sales",
    [m(ySales.vehiclesSold), m(ySales.monthlySales), m(ySales.grossProfit)],
    [
      [0, 0],
      [0, 0],
      [0, 0],
    ]
  );
  const trickOrg = await get(
    `/api/v1/dashboard/sales?${WINDOW_QS}&organizationId=${X.org.id}`,
    Y.users.dealerOwner.token
  );
  ok(
    "a client-supplied organizationId is rejected, not honoured",
    trickOrg.status === 400 && trickOrg.json.code === "tenant_field_not_allowed"
  );
  const trickDealership = await get(`/api/v1/dashboard/inventory?dealershipId=${X.org.id}`, Y.users.dealerOwner.token);
  ok("...and so is dealershipId", trickDealership.status === 400);

  // ═════════ 5. bad input is a 400, never a 500 ═════════
  const o = tok("dealerOwner");
  const bad: [string, string][] = [
    ["unknown period", "/api/v1/dashboard/sales?period=decade"],
    ["unknown parameter", "/api/v1/dashboard/sales?foo=bar"],
    ["custom without dates", "/api/v1/dashboard/sales?period=custom"],
    ["custom with only from", "/api/v1/dashboard/sales?period=custom&from=2026-03-01"],
    ["from/to without custom", "/api/v1/dashboard/sales?from=2026-03-01&to=2026-03-31"],
    ["to before from", "/api/v1/dashboard/sales?period=custom&from=2026-03-10&to=2026-03-01"],
    ["impossible date", "/api/v1/dashboard/sales?period=custom&from=2026-02-30&to=2026-03-31"],
    ["not a date", "/api/v1/dashboard/leads?period=custom&from=yesterday&to=today"],
    ["longer than 731 days", "/api/v1/dashboard/inventory?period=custom&from=2024-01-01&to=2026-03-01"],
    ["months = 0", "/api/v1/dashboard/sales-trend?months=0"],
    ["months = 37", "/api/v1/dashboard/sales-trend?months=37"],
    ["months not a number", "/api/v1/dashboard/sales-trend?months=abc"],
    ["sales-trend with a period", "/api/v1/dashboard/sales-trend?period=month"],
  ];
  for (const [name, path] of bad) {
    const r = await get(path, o);
    ok(
      `400 for: ${name}`,
      r.status === 400 && r.json?.code === "validation_error",
      `status ${r.status} ${r.raw.slice(0, 120)}`
    );
  }
  const injection = await get(`/api/v1/dashboard/sales?period=${encodeURIComponent("month'; DROP TABLE deals;--")}`, o);
  ok("SQL in a parameter is just an invalid value (400)", injection.status === 400);
  ok("...and the deals table is fine", (await db.deal.count({ where: { organizationId: X.org.id } })) > 0);
  const okYear = await get("/api/v1/dashboard/sales?period=ytd", o);
  const ok90 = await get("/api/v1/dashboard/leads?period=last90", o);
  const ok30 = await get("/api/v1/dashboard/inventory?period=last30", o);
  same("ytd / last90 / last30 presets work", [okYear.status, ok90.status, ok30.status], [200, 200, 200]);

  // ═════════ 6. live: a completed sale shows up on the next request ═════════
  const before = (await get(paths.sales, o)).json.monthlySales.value;
  const extra = await db.vehicle.create({
    data: {
      organizationId: X.org.id,
      branchId: X.downtown.id,
      stockNumber: `LIVE-${suffix}`,
      make: "Kia",
      model: "Sportage",
      year: 2023,
      listPrice: 60_000,
      purchasePrice: 48_000,
      acquiredAt: at("2026-03-10"),
    },
  });
  const cust = await db.customer.create({ data: { organizationId: X.org.id, name: "Live customer" } });
  await db.deal.create({
    data: {
      organizationId: X.org.id,
      reference: `LIVE-${suffix}`,
      customerId: cust.id,
      vehicleId: extra.id,
      branchId: X.downtown.id,
      salespersonId: X.users.salesperson.id,
      status: "COMPLETED",
      salePrice: 58_000,
      completedAt: at("2026-03-25"),
    },
  });
  const after = (await get(paths.sales, o)).json;
  same(
    "a newly completed deal is reflected immediately (revenue +58k, profit +10k)",
    [after.monthlySales.value - before, after.grossProfit.value],
    [58_000, 57_000]
  );
  same(
    "...and in the salesperson's own view",
    m((await get(paths.sales, tok("salesperson"))).json.monthlySales),
    [110_000, 75_000]
  );
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nDashboard HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Dashboard HTTP check OK: ${passed} assertions passed.`);
  });
