/**
 * Database check for the dashboard: the SQL functions, the triggers they depend on, and the tenancy
 * guarantees around them. Run with `npm run check:dashboard-db` on a THROWAWAY database that has been
 * migrated and seeded and has the `cda_app` role (writes test data).
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... npm run check:dashboard-db
 *
 * Data is written with the owner connection; every query under test runs as the RLS-restricted
 * `cda_app` role inside a tenant transaction, exactly like the application.
 */
import { createPrismaClient } from "@/server/db/client";
import { runInTenant, type TenantDb } from "@/server/db/tenant";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { at, EXPECTED, seedDashboardFixture, WINDOW } from "./lib/dashboard-fixture";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const url = process.env.DIRECT_DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL.");

const prisma = createPrismaClient(url, { maxConnections: 3 });
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

async function expectRejects(name: string, pattern: RegExp, fn: () => Promise<unknown>) {
  try {
    await fn();
    failures.push(`${name} - expected an error but it succeeded`);
  } catch (error) {
    const text = String((error as Error).message) + String((error as { cause?: unknown }).cause ?? "");
    if (pattern.test(text)) passed++;
    else failures.push(`${name} - wrong error: ${text.slice(0, 240)}`);
  }
}

interface Row {
  metric: string;
  value: number | null;
  previous: number | null;
}
const pair = (rows: Row[], metric: string) => {
  const r = rows.find((x) => x.metric === metric);
  return [r?.value ?? null, r?.previous ?? null];
};

/** Runs as cda_app, scoped to one organization. */
const asApp = <T>(orgId: string, fn: (db: TenantDb) => Promise<T>) =>
  runInTenant(prisma, orgId, fn, { assumeRole: "cda_app" });

const C = WINDOW.current;
const P = WINDOW.previous;
const win = [C.from, C.to, P.from, P.to] as const;

const stock = (db: TenantDb, branchIds: string[] | null, cost: boolean) =>
  db.$queryRaw<
    Row[]
  >`SELECT * FROM dashboard_stock_kpis(${win[0]}::timestamptz, ${win[1]}::timestamptz, ${win[2]}::timestamptz, ${win[3]}::timestamptz, ${branchIds}::text[], ${cost}::boolean)`;
const sales = (db: TenantDb, branchIds: string[] | null, ownerId: string | null, profit: boolean) =>
  db.$queryRaw<
    Row[]
  >`SELECT * FROM dashboard_sales_kpis(${win[0]}::timestamptz, ${win[1]}::timestamptz, ${win[2]}::timestamptz, ${win[3]}::timestamptz, ${branchIds}::text[], ${ownerId}::text, ${profit}::boolean)`;
const leads = (db: TenantDb, branchIds: string[] | null, ownerId: string | null) =>
  db.$queryRaw<
    Row[]
  >`SELECT * FROM dashboard_lead_kpis(${win[0]}::timestamptz, ${win[1]}::timestamptz, ${win[2]}::timestamptz, ${win[3]}::timestamptz, ${branchIds}::text[], ${ownerId}::text)`;

async function makeOrg(label: string) {
  const org = await prisma.organization.create({
    data: { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  const roles = await prisma.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const downtown = await prisma.branch.create({ data: { organizationId: org.id, name: "Downtown" } });
  const airport = await prisma.branch.create({ data: { organizationId: org.id, name: "Airport" } });
  const mk = (key: string) =>
    prisma.user.create({
      data: {
        organizationId: org.id,
        roleId: roles.salesperson,
        name: key,
        email: `${key}-${label}-${suffix}@example.com`.toLowerCase(),
        status: "ACTIVE",
      },
    });
  const [owner, sp1, sp2] = [await mk("owner"), await mk("sp1"), await mk("sp2")];
  return { org, downtown, airport, owner, sp1, sp2 };
}

async function main() {
  const A = await makeOrg("Alpha");
  const B = await makeOrg("Bravo");
  const refsA = {
    organizationId: A.org.id,
    downtownId: A.downtown.id,
    airportId: A.airport.id,
    ownerId: A.owner.id,
    sp1Id: A.sp1.id,
    sp2Id: A.sp2.id,
  };
  const refsB = {
    organizationId: B.org.id,
    downtownId: B.downtown.id,
    airportId: B.airport.id,
    ownerId: B.owner.id,
    sp1Id: B.sp1.id,
    sp2Id: B.sp2.id,
  };
  const fa = await seedDashboardFixture(prisma, refsA, `a${suffix}`);
  await seedDashboardFixture(prisma, refsB, `b${suffix}`);
  // Organization B also sells a very expensive car, so any leak into A's numbers would be obvious.
  const bigB = await prisma.vehicle.create({
    data: {
      organizationId: B.org.id,
      stockNumber: `BIG-${suffix}`,
      make: "Bugatti",
      model: "Chiron",
      year: 2023,
      listPrice: 9_000_000,
      purchasePrice: 5_000_000,
      acquiredAt: at("2026-03-04"),
    },
  });
  const E = EXPECTED.all;

  // ═══════════════ 1. the numbers, organization-wide ═══════════════
  const s = await asApp(A.org.id, (db) => stock(db, null, true));
  same("total vehicles (as at period end / previous end)", pair(s, "total_vehicles"), E.stock.total);
  same("available vehicles", pair(s, "available_vehicles"), E.stock.available);
  same("vehicles purchased in each window (archived excluded)", pair(s, "vehicles_purchased"), E.stock.purchased);
  same(
    "expected revenue of stock (expected price, else list price)",
    pair(s, "expected_revenue"),
    E.stock.expectedRevenue
  );
  same(
    "inventory value = cost of stock (purchase+repair+transport+other)",
    pair(s, "inventory_value"),
    E.stock.inventoryValue
  );

  const sl = await asApp(A.org.id, (db) => sales(db, null, null, true));
  same("vehicles sold", pair(sl, "vehicles_sold"), E.sales.sold);
  same("sales revenue excludes draft/accepted/cancelled deals", pair(sl, "sales_revenue"), E.sales.revenue);
  same("gross profit = sale price - cost snapshot", pair(sl, "gross_profit"), E.sales.grossProfit);

  const ld = await asApp(A.org.id, (db) => leads(db, null, null));
  same("new leads", pair(ld, "new_leads"), E.leads.new);
  same("won leads (cohort)", pair(ld, "won_leads"), E.leads.won);
  same("conversion rate %", pair(ld, "conversion_rate"), E.leads.rate);

  // ═══════════════ 2. sensitive figures are not even computed unless asked ═══════════════
  const noCost = await asApp(A.org.id, (db) => stock(db, null, false));
  same("inventory value is NULL without p_include_cost", pair(noCost, "inventory_value"), [null, null]);
  same("...while the other stock figures are unchanged", pair(noCost, "total_vehicles"), E.stock.total);
  const noProfit = await asApp(A.org.id, (db) => sales(db, null, null, false));
  same("gross profit is NULL without p_include_profit", pair(noProfit, "gross_profit"), [null, null]);
  same("...while revenue is unchanged", pair(noProfit, "sales_revenue"), E.sales.revenue);

  // ═══════════════ 3. scopes ═══════════════
  const sp1 = await asApp(A.org.id, (db) => sales(db, null, A.sp1.id, true));
  same("own scope (sp1): sold", pair(sp1, "vehicles_sold"), [1, 1]);
  same("own scope (sp1): revenue", pair(sp1, "sales_revenue"), [52_000, 75_000]);
  same("own scope (sp1): profit", pair(sp1, "gross_profit"), [12_000, 15_000]);
  const sp2 = await asApp(A.org.id, (db) => sales(db, null, A.sp2.id, true));
  same("own scope (sp2): revenue", pair(sp2, "sales_revenue"), [155_000, 0]);
  const airportSales = await asApp(A.org.id, (db) => sales(db, [A.airport.id], null, true));
  same("branch scope (Airport): revenue", pair(airportSales, "sales_revenue"), [155_000, 0]);
  const noBranch = await asApp(A.org.id, (db) => sales(db, [], null, true));
  same("empty branch list matches nothing", pair(noBranch, "sales_revenue"), [0, 0]);
  const airportStock = await asApp(A.org.id, (db) => stock(db, [A.airport.id], true));
  same("branch scope (Airport): total vehicles", pair(airportStock, "total_vehicles"), [2, 1]);
  same("branch scope (Airport): inventory value", pair(airportStock, "inventory_value"), [80_000, 120_000]);
  const nobodyStock = await asApp(A.org.id, (db) => stock(db, [], true));
  same("empty branch list: no vehicles at all", pair(nobodyStock, "total_vehicles"), [0, 0]);
  const sp1Leads = await asApp(A.org.id, (db) => leads(db, null, A.sp1.id));
  same("own scope (sp1): new leads", pair(sp1Leads, "new_leads"), [2, 2]);
  same("own scope (sp1): conversion rate", pair(sp1Leads, "conversion_rate"), [50, 50]);
  const airportLeads = await asApp(A.org.id, (db) => leads(db, [A.airport.id], null));
  same("branch scope (Airport): conversion rate, no leads -> 0%", pair(airportLeads, "conversion_rate"), [50, 0]);

  // ═══════════════ 4. empty data: zeros for counts, NULL for a rate with no leads ═══════════════
  const emptyOrg = await makeOrg("Empty");
  const emptyStock = await asApp(emptyOrg.org.id, (db) => stock(db, null, true));
  same(
    "empty organization: stock is all zeros",
    [pair(emptyStock, "total_vehicles"), pair(emptyStock, "inventory_value")],
    [
      [0, 0],
      [0, 0],
    ]
  );
  const emptyLeads = await asApp(emptyOrg.org.id, (db) => leads(db, null, null));
  same("empty organization: conversion rate is NULL (no data), not 0%", pair(emptyLeads, "conversion_rate"), [
    null,
    null,
  ]);

  // ═══════════════ 5. monthly series ═══════════════
  const now = new Date();
  const monthsSinceFeb2026 = (now.getUTCFullYear() - 2026) * 12 + now.getUTCMonth() - 1 + 1;
  const series = await asApp(
    A.org.id,
    (db) =>
      db.$queryRaw<{ month_start: Date; vehicles_sold: number; revenue: number; gross_profit: number | null }[]>`
      SELECT * FROM dashboard_monthly_sales(${monthsSinceFeb2026}::integer, ${"Asia/Dubai"}, NULL::text[], NULL::text, true)`
  );
  const byMonth = Object.fromEntries(series.map((r) => [r.month_start.toISOString().slice(0, 7), r]));
  ok(
    "series has exactly N consecutive months, oldest first",
    series.length === monthsSinceFeb2026 && series[0].month_start.toISOString().startsWith("2026-02")
  );
  same(
    "Feb 2026: 1 sale, 75k, profit 15k",
    [byMonth["2026-02"].vehicles_sold, byMonth["2026-02"].revenue, byMonth["2026-02"].gross_profit],
    [1, 75_000, 15_000]
  );
  same(
    "Mar 2026: 2 sales, 207k, profit 47k",
    [byMonth["2026-03"].vehicles_sold, byMonth["2026-03"].revenue, byMonth["2026-03"].gross_profit],
    [2, 207_000, 47_000]
  );
  same(
    "Apr 2026 has no sales but is present (zero-filled)",
    [byMonth["2026-04"].vehicles_sold, byMonth["2026-04"].revenue],
    [0, 0]
  );
  ok(
    "a sale at 21:00 UTC on May 31 lands in JUNE in Dubai time",
    byMonth["2026-06"]?.vehicles_sold === 1 && byMonth["2026-05"]?.vehicles_sold === 0
  );
  const utcSeries = await asApp(
    A.org.id,
    (db) =>
      db.$queryRaw<{ month_start: Date; vehicles_sold: number }[]>`
      SELECT month_start, vehicles_sold FROM dashboard_monthly_sales(${monthsSinceFeb2026}::integer, ${"UTC"}, NULL::text[], NULL::text, false)`
  );
  ok(
    "...but in MAY in UTC (bucketing follows the time zone)",
    utcSeries.find((r) => r.month_start.toISOString().startsWith("2026-05"))?.vehicles_sold === 1
  );
  const noProfitSeries = await asApp(
    A.org.id,
    (db) =>
      db.$queryRaw<
        { gross_profit: number | null }[]
      >`SELECT gross_profit FROM dashboard_monthly_sales(3::integer, ${"UTC"}, NULL::text[], NULL::text, false)`
  );
  ok(
    "monthly gross profit is NULL without p_include_profit",
    noProfitSeries.every((r) => r.gross_profit === null)
  );
  const ownSeries = await asApp(
    A.org.id,
    (db) =>
      db.$queryRaw<
        { month_start: Date; revenue: number }[]
      >`SELECT month_start, revenue FROM dashboard_monthly_sales(${monthsSinceFeb2026}::integer, ${"UTC"}, NULL::text[], ${A.sp2.id}::text, false)`
  );
  same(
    "monthly series honours the owner scope (sp2 only sold V5 in March)",
    ownSeries.filter((r) => r.revenue > 0).map((r) => [r.month_start.toISOString().slice(0, 7), r.revenue]),
    [["2026-03", 155_000]]
  );
  await expectRejects("months=0 is refused", /months must be between/, () =>
    asApp(
      A.org.id,
      (db) => db.$queryRaw`SELECT * FROM dashboard_monthly_sales(0::integer, 'UTC', NULL::text[], NULL::text, false)`
    )
  );
  await expectRejects("months=37 is refused", /months must be between/, () =>
    asApp(
      A.org.id,
      (db) => db.$queryRaw`SELECT * FROM dashboard_monthly_sales(37::integer, 'UTC', NULL::text[], NULL::text, false)`
    )
  );

  // ═══════════════ 6. period boundaries ═══════════════
  type Bounds = { period_start: Date; period_end: Date; prev_start: Date; prev_end: Date };
  const bounds = (preset: string, tz = "Asia/Dubai", from: string | null = null, to: string | null = null) =>
    asApp(
      A.org.id,
      async (db) =>
        (
          await db.$queryRaw<
            Bounds[]
          >`SELECT * FROM dashboard_period_bounds(${preset}, ${tz}, ${from}::date, ${to}::date)`
        )[0]
    );
  const cust = await bounds("custom", "Asia/Dubai", "2026-03-01", "2026-03-31");
  same("custom: from is midnight in the org time zone", cust.period_start.toISOString(), "2026-02-28T20:00:00.000Z");
  same("custom: to is inclusive (start of the next day)", cust.period_end.toISOString(), "2026-03-31T20:00:00.000Z");
  ok(
    "custom: the previous period is the equal-length span right before",
    cust.prev_end.getTime() === cust.period_start.getTime() &&
      cust.period_end.getTime() - cust.period_start.getTime() === cust.prev_end.getTime() - cust.prev_start.getTime()
  );
  const month = await bounds("month");
  const nowMs = Date.now();
  ok(
    "month: starts on the 1st (Dubai) and ends now",
    month.period_start.getTime() < nowMs &&
      Math.abs(month.period_end.getTime() - nowMs) < 5 * 60_000 &&
      new Date(month.period_start.getTime() + 4 * 3600_000).getUTCDate() === 1
  );
  ok(
    "month: the comparison ends no later than this month starts and has the same length (or up to the month end)",
    month.prev_end.getTime() <= month.period_start.getTime() &&
      month.prev_end.getTime() - month.prev_start.getTime() <= month.period_end.getTime() - month.period_start.getTime()
  );
  const l30 = await bounds("last30");
  ok(
    "last30: 30 days, previous = the 30 days before",
    Math.round((l30.period_end.getTime() - l30.period_start.getTime()) / 86400000) === 30 &&
      l30.prev_end.getTime() === l30.period_start.getTime()
  );
  const ytd = await bounds("ytd");
  ok("ytd: starts Jan 1", new Date(ytd.period_start.getTime() + 4 * 3600_000).toISOString().slice(5, 10) === "01-01");
  await expectRejects("unknown preset is refused", /unknown period preset/, () => bounds("decade"));
  await expectRejects("custom without dates is refused", /custom period needs/, () => bounds("custom"));
  await expectRejects("custom with to before from is refused", /custom period needs/, () =>
    bounds("custom", "UTC", "2026-03-05", "2026-03-01")
  );
  await expectRejects("custom longer than 731 days is refused", /cannot exceed 731/, () =>
    bounds("custom", "UTC", "2024-01-01", "2026-03-01")
  );
  await expectRejects("an invalid time zone is refused", /time zone/i, () => bounds("month", "Mars/Olympus"));
  await expectRejects("a period with to <= from is refused by the KPI functions", /invalid period/, () =>
    asApp(
      A.org.id,
      (db) =>
        db.$queryRaw`SELECT * FROM dashboard_lead_kpis(${C.to}::timestamptz, ${C.from}::timestamptz, ${P.from}::timestamptz, ${P.to}::timestamptz, NULL::text[], NULL::text)`
    )
  );

  // ═══════════════ 7. tenant isolation of the functions ═══════════════
  const bStock = await asApp(B.org.id, (db) => stock(db, null, true));
  same("tenant B sees only its own vehicles (fixture + one Bugatti)", pair(bStock, "total_vehicles"), [8, 4]);
  ok(
    "...and B's big car does not leak into A's inventory value",
    pair(s, "inventory_value")[0] === 260_000 && (pair(bStock, "inventory_value")[0] ?? 0) > 5_000_000
  );
  await expectRejects(
    "a function called with NO tenant context raises instead of returning zeros",
    /no tenant context/,
    () =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
        await tx.$queryRaw`SELECT * FROM dashboard_lead_kpis(${C.from}::timestamptz, ${C.to}::timestamptz, ${P.from}::timestamptz, ${P.to}::timestamptz, NULL::text[], NULL::text)`;
      })
  );
  ok(
    "cda_app has EXECUTE; PUBLIC does not",
    (
      await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'dashboard\_%' OR p.proname = 'cda_current_org')
          AND has_function_privilege('cda_app', p.oid, 'EXECUTE') AND NOT has_function_privilege('public', p.oid, 'EXECUTE')`
    )[0].n === 6
  );
  const seenByA = await asApp(A.org.id, (db) => db.vehicle.findMany({ select: { organizationId: true } }));
  ok("RLS: A sees only its 9 vehicles", seenByA.length === 9 && seenByA.every((v) => v.organizationId === A.org.id));
  const noTenantRows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
    return [
      await tx.vehicle.count(),
      await tx.deal.count(),
      await tx.lead.count(),
      await tx.customer.count(),
      await tx.vehicleStatusEvent.count(),
    ];
  });
  same(
    "RLS: with no tenant set, vehicles/deals/leads/customers/events are all invisible",
    noTenantRows,
    [0, 0, 0, 0, 0]
  );
  await expectRejects(
    "app layer: the tenant guard refuses a vehicle for another organization",
    /Tenancy violation/,
    () =>
      asApp(A.org.id, (db) =>
        db.vehicle.create({
          data: { organizationId: B.org.id, stockNumber: "X", make: "X", model: "X", year: 2020, listPrice: 1 },
        })
      )
  );
  await expectRejects(
    "RLS (raw SQL, bypassing the app layer): cannot insert a vehicle into another organization",
    /row-level security/i,
    () =>
      asApp(
        A.org.id,
        (db) => db.$executeRaw`
      INSERT INTO vehicles (id, organization_id, stock_number, make, model, year, list_price, updated_at)
      VALUES (${`rls-${suffix}`}, ${B.org.id}, 'RLS-X', 'X', 'X', 2020, 1, now())`
      )
  );
  same(
    "RLS: cannot update or delete another organization's vehicle",
    await asApp(A.org.id, async (db) => [
      await db.$executeRaw`UPDATE vehicles SET make = 'Hacked' WHERE id = ${bigB.id}`,
      await db.$executeRaw`DELETE FROM vehicles WHERE id = ${bigB.id}`,
    ]),
    [0, 0]
  );

  // ═══════════════ 8. composite foreign keys: nothing can point at another tenant ═══════════════
  const custB = await prisma.customer.create({ data: { organizationId: B.org.id, name: "B customer" } });
  await expectRejects("a deal cannot use another tenant's vehicle", /foreign key/i, () =>
    prisma.deal.create({
      data: {
        organizationId: A.org.id,
        reference: `X1-${suffix}`,
        customerId: fa.customer.id,
        vehicleId: bigB.id,
        salePrice: 1,
      },
    })
  );
  await expectRejects("a deal cannot use another tenant's customer", /foreign key/i, () =>
    prisma.deal.create({
      data: {
        organizationId: A.org.id,
        reference: `X2-${suffix}`,
        customerId: custB.id,
        vehicleId: fa.vehicles.v1.id,
        salePrice: 1,
      },
    })
  );
  await expectRejects("a deal cannot be owned by another tenant's salesperson", /foreign key/i, () =>
    prisma.deal.create({
      data: {
        organizationId: A.org.id,
        reference: `X3-${suffix}`,
        customerId: fa.customer.id,
        vehicleId: fa.vehicles.v1.id,
        salespersonId: B.sp1.id,
        salePrice: 1,
      },
    })
  );
  await expectRejects("a lead cannot be assigned to another tenant's user", /foreign key/i, () =>
    prisma.lead.create({ data: { organizationId: A.org.id, customerId: fa.customer.id, assignedToId: B.sp1.id } })
  );
  await expectRejects("a vehicle cannot sit in another tenant's branch", /foreign key/i, () =>
    prisma.vehicle.create({
      data: {
        organizationId: A.org.id,
        branchId: B.downtown.id,
        stockNumber: `X4-${suffix}`,
        make: "X",
        model: "X",
        year: 2020,
        listPrice: 1,
      },
    })
  );
  await expectRejects("stock number is unique per organization", /unique/i, () =>
    prisma.vehicle.create({
      data: {
        organizationId: A.org.id,
        stockNumber: fa.vehicles.v1.stockNumber,
        make: "X",
        model: "X",
        year: 2020,
        listPrice: 1,
      },
    })
  );
  await expectRejects("negative prices are refused", /vehicles_amounts_chk|check constraint/i, () =>
    prisma.vehicle.create({
      data: { organizationId: A.org.id, stockNumber: `X5-${suffix}`, make: "X", model: "X", year: 2020, listPrice: -1 },
    })
  );
  await expectRejects("a lead score outside 0-100 is refused", /leads_score_chk|check constraint/i, () =>
    prisma.lead.create({ data: { organizationId: A.org.id, customerId: fa.customer.id, score: 101 } })
  );

  // ═══════════════ 9. triggers: the rules the numbers depend on ═══════════════
  const events = await prisma.vehicleStatusEvent.findMany({
    where: { vehicleId: fa.vehicles.v3.id },
    orderBy: { seq: "asc" },
  });
  same(
    "history: V3 started as purchased and became available on Mar 10",
    events.map((e) => [e.fromStatus, e.toStatus, e.changedAt.toISOString().slice(0, 10)]),
    [
      [null, "PURCHASED", "2026-03-05"],
      ["PURCHASED", "AVAILABLE", "2026-03-10"],
    ]
  );
  const v5Events = await prisma.vehicleStatusEvent.findMany({
    where: { vehicleId: fa.vehicles.v5.id },
    orderBy: { seq: "asc" },
  });
  same(
    "history: V5's sale is dated at the deal's completion (Mar 12), not at insert time",
    v5Events.map((e) => [e.toStatus, e.changedAt.toISOString().slice(0, 10)]),
    [
      ["AVAILABLE", "2026-02-01"],
      ["SOLD", "2026-03-12"],
    ]
  );
  await expectRejects("history is append-only for cda_app (no UPDATE)", /permission denied/i, () =>
    asApp(A.org.id, (db) => db.$executeRaw`UPDATE vehicle_status_events SET to_status = 'available'`)
  );
  await expectRejects("history is append-only for cda_app (no DELETE)", /permission denied/i, () =>
    asApp(A.org.id, (db) => db.$executeRaw`DELETE FROM vehicle_status_events`)
  );

  await expectRejects("a vehicle cannot be marked sold directly", /only by completing a deal/, () =>
    prisma.vehicle.update({ where: { id: fa.vehicles.v1.id }, data: { status: "SOLD" } })
  );
  await expectRejects("a vehicle cannot be CREATED as sold", /only by completing a deal/, () =>
    prisma.vehicle.create({
      data: {
        organizationId: A.org.id,
        stockNumber: `X6-${suffix}`,
        make: "X",
        model: "X",
        year: 2020,
        listPrice: 1,
        status: "SOLD",
      },
    })
  );
  await expectRejects("a sold vehicle cannot change status again", /sold vehicle cannot change status/, () =>
    prisma.vehicle.update({ where: { id: fa.vehicles.v4.id }, data: { status: "AVAILABLE" } })
  );
  ok(
    "the completed deal stamped the vehicle SOLD",
    (await prisma.vehicle.findUniqueOrThrow({ where: { id: fa.vehicles.v4.id } })).status === "SOLD"
  );
  const d4 = await prisma.deal.findUniqueOrThrow({ where: { id: fa.deals.d4.id } });
  same("cost of sale was snapshotted from the vehicle (60k)", Number(d4.costOfSale), 60_000);
  const draft = await prisma.deal.create({
    data: {
      organizationId: A.org.id,
      reference: `D-${suffix}`,
      customerId: fa.customer.id,
      vehicleId: fa.vehicles.v1.id,
      salePrice: 1,
      costOfSale: 5,
      completedAt: at("2026-03-01"),
    },
  });
  ok(
    "a non-completed deal cannot carry cost_of_sale/completed_at (cleared by the database)",
    draft.costOfSale === null && draft.completedAt === null
  );
  const forged = await prisma.deal.create({
    data: {
      organizationId: A.org.id,
      reference: `F-${suffix}`,
      customerId: fa.customer.id,
      vehicleId: fa.vehicles.v2.id,
      salePrice: 90_000,
      status: "COMPLETED",
      costOfSale: 1,
      completedAt: at("2026-03-25"),
    },
  });
  same("a caller-supplied cost_of_sale is ignored: the database computes it (50k)", Number(forged.costOfSale), 50_000);
  ok(
    "...and the vehicle is now sold",
    (await prisma.vehicle.findUniqueOrThrow({ where: { id: fa.vehicles.v2.id } })).status === "SOLD"
  );
  await expectRejects("a vehicle cannot be sold twice", /already been sold/, () =>
    prisma.deal.create({
      data: {
        organizationId: A.org.id,
        reference: `T-${suffix}`,
        customerId: fa.customer.id,
        vehicleId: fa.vehicles.v2.id,
        salePrice: 1,
        status: "COMPLETED",
      },
    })
  );
  await expectRejects("an archived vehicle cannot be sold", /archived vehicle cannot be sold/, () =>
    prisma.deal.create({
      data: {
        organizationId: A.org.id,
        reference: `T2-${suffix}`,
        customerId: fa.customer.id,
        vehicleId: fa.vehicles.v7.id,
        salePrice: 1,
        status: "COMPLETED",
      },
    })
  );
  await expectRejects("a sale cannot predate the acquisition", /before it was acquired/, () =>
    prisma.deal.create({
      data: {
        organizationId: A.org.id,
        reference: `T3-${suffix}`,
        customerId: fa.customer.id,
        vehicleId: fa.vehicles.v8.id,
        salePrice: 1,
        status: "COMPLETED",
        completedAt: at("2026-01-01"),
      },
    })
  );
  ok(
    "...and a rejected sale leaves the vehicle untouched",
    (await prisma.vehicle.findUniqueOrThrow({ where: { id: fa.vehicles.v8.id } })).status === "RESERVED"
  );
  await expectRejects("a completed deal's price cannot be edited", /financial record/, () =>
    prisma.deal.update({ where: { id: fa.deals.d4.id }, data: { salePrice: 1 } })
  );
  await expectRejects("a completed deal cannot be cancelled", /financial record/, () =>
    prisma.deal.update({ where: { id: fa.deals.d4.id }, data: { status: "CANCELLED" } })
  );
  await prisma.deal.update({ where: { id: fa.deals.d4.id }, data: { notes: "customer collected the car" } });
  ok(
    "...but a note can still be added to it",
    (await prisma.deal.findUniqueOrThrow({ where: { id: fa.deals.d4.id } })).notes === "customer collected the car"
  );
  await prisma.vehicle.update({ where: { id: fa.vehicles.v4.id }, data: { repairCost: 999_999 } });
  // March now also holds the V2 sale above (90k - 50k = 40k), so profit is 47k + 40k; February is untouched.
  same(
    "a later cost change (V4 repairs) does not rewrite history: gross profit is unchanged",
    pair(await asApp(A.org.id, (db) => sales(db, null, null, true)), "gross_profit"),
    [87_000, 15_000]
  );
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await prisma.$disconnect();
    if (failures.length) {
      console.error(
        `\nDashboard DB check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Dashboard DB check OK: ${passed} assertions passed.`);
  });
