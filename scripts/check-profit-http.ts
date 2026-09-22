/**
 * End-to-end check of the profit endpoints over real HTTP. Run with `npm run check:profit-http` against a
 * RUNNING app (started as the RLS-restricted `cda_app` role, COOKIE_SECURE=false) on a THROWAWAY migrated +
 * seeded database (writes test data):
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:profit-http
 *
 *   POST /api/v1/profit/calculate       what-if from caller-supplied numbers   (profit:read)
 *   POST /api/v1/vehicles/:id/profit    a stored vehicle, costs read from the database  (profit:read + vehicles:read)
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { calculateProfit, type ProfitInput } from "@/lib/profit/calculate";
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
}
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];
const nextIp = () => `10.${runOctets[0]}.${runOctets[1] + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function post(path: string, body: unknown, token?: string, rawBody?: string): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": nextIp(), "content-type": "application/json" };
  if (token) headers.cookie = `${sessionCookieName()}=${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: rawBody ?? JSON.stringify(body) });
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

async function makeOrg(label: string) {
  const org = await db.organization.create({
    data: { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com` },
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

const EXAMPLE_B: ProfitInput = {
  sellingPrice: 131_250,
  vat: { included: true, ratePercent: 5 },
  costs: {
    purchasePrice: 100_000,
    importDuty: 2_000,
    transport: 1_500,
    inspection: 500,
    repair: 4_000,
    registration: 1_000,
    other: 1_000,
  },
  sellingExpenses: {
    commissionPercent: 1.5,
    commission: 500,
    marketing: 1_000,
    warranty: 800,
    other: 200,
    holding: { days: 45, annualRatePercent: 8, dailyOverhead: 20 },
  },
};

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
      sp1Id: X.users.salesperson.id,
      sp2Id: X.users.sales2.id,
    },
    `x${suffix}`
  );
  const yVehicle = await db.vehicle.create({
    data: {
      organizationId: Y.org.id,
      stockNumber: `Y1-${suffix}`,
      make: "Nissan",
      model: "Patrol",
      year: 2021,
      listPrice: 200_000,
      purchasePrice: 150_000,
    },
  });
  const tok = (k: string) => X.users[k].token;
  const V = fx.vehicles;
  const calc = "/api/v1/profit/calculate";
  const vehicleProfit = (id: string) => `/api/v1/vehicles/${id}/profit`;

  // ═════════ 1. who may call what ═════════
  const roles: [string, number, number][] = [
    // role, /profit/calculate, /vehicles/:id/profit
    ["dealerOwner", 200, 200],
    ["manager", 200, 200],
    ["buyer", 200, 200],
    ["accountant", 200, 403], // has profit:read but no vehicles:read
    ["salesperson", 403, 403], // no profit:read
    ["viewer", 403, 403],
    ["marketingManager", 403, 403],
  ];
  for (const [role, calcStatus, vehicleStatus] of roles) {
    same(`${role}: calculate -> ${calcStatus}`, (await post(calc, EXAMPLE_B, tok(role))).status, calcStatus);
    same(
      `${role}: vehicle profit -> ${vehicleStatus}`,
      (await post(vehicleProfit(V.v1.id), {}, tok(role))).status,
      vehicleStatus
    );
  }
  same(
    "no session -> 401 on both endpoints",
    [(await post(calc, EXAMPLE_B)).status, (await post(vehicleProfit(V.v1.id), {})).status],
    [401, 401]
  );
  const denied = await post(vehicleProfit(V.v1.id), {}, tok("accountant"));
  ok(
    "a refusal on the second required permission uses the standard 403 body",
    denied.status === 403 && denied.json?.code === "forbidden"
  );
  const auditedSecond = await db.auditLog.findFirst({
    where: {
      organizationId: X.org.id,
      action: "authz.denied",
      actorUserId: X.users.accountant.id,
      metadata: { path: ["permission"], equals: "vehicles:read" },
    },
  });
  ok("...and it is audited naming vehicles:read", !!auditedSecond);

  // ═════════ 2. stateless calculation: the API returns exactly what the library computes ═════════
  const b = (await post(calc, EXAMPLE_B, tok("dealerOwner"))).json;
  same(
    "worked example B over HTTP: net profit, profit %, ROI",
    [b.netProfit, b.profitPercent, b.roiPercent],
    [8_640.07, 6.91, 7.43]
  );
  same(
    "worked example B over HTTP: total cost, gross profit, break-even price",
    [b.totalCost, b.grossProfit, b.breakEvenPrice],
    [110_000, 15_000, 122_039.78]
  );
  same("the API response equals calculateProfit() run in-process", b, calculateProfit(EXAMPLE_B));
  const stringy = (await post(calc, { sellingPrice: "1000.50", costs: { purchasePrice: "400.25" } }, tok("manager")))
    .json;
  same("amounts may be decimal strings", stringy.grossProfit, 600.25);
  const zero = (await post(calc, { sellingPrice: 0, costs: { purchasePrice: 0 } }, tok("manager"))).json;
  same("a ratio with no denominator is JSON null, not NaN/0", [zero.profitPercent, zero.roiPercent], [null, null]);

  // 25 random-but-valid bodies: HTTP result == in-process result (nothing lost or altered in transport)
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const money = (max: number) => Math.round(rnd() * max * 100) / 100;
  let identical = 0;
  for (let i = 0; i < 25; i++) {
    const input: ProfitInput = {
      sellingPrice: money(400_000),
      vat: rnd() < 0.5 ? { included: rnd() < 0.5, ratePercent: 5 } : undefined,
      costs: { purchasePrice: money(300_000), repair: money(20_000), transport: money(5_000) },
      sellingExpenses: {
        commissionPercent: Math.round(rnd() * 500) / 100,
        marketing: money(3_000),
        holding: { days: Math.floor(rnd() * 200), annualRatePercent: 6, dailyOverhead: money(50) },
      },
    };
    const r = (await post(calc, input, tok("buyer"))).json;
    if (JSON.stringify(r) === JSON.stringify(calculateProfit(input))) identical++;
  }
  same("25 random bodies: HTTP result is identical to the library result", identical, 25);

  // ═════════ 3. a stored vehicle: costs come from the database ═════════
  const v1 = (await post(vehicleProfit(V.v1.id), {}, tok("dealerOwner"))).json;
  same(
    "V1: price defaults to the expected selling price",
    [v1.sellingPriceSource, v1.revenue],
    ["expectedSellingPrice", 125_000]
  );
  same(
    "V1: total cost is purchase + repair + transport + other from the database",
    [
      v1.costBreakdown.purchasePrice,
      v1.costBreakdown.repair,
      v1.costBreakdown.transport,
      v1.costBreakdown.other,
      v1.totalCost,
    ],
    [90_000, 5_000, 3_000, 2_000, 100_000]
  );
  same(
    "V1: gross/net profit, profit %, ROI, break-even",
    [v1.grossProfit, v1.netProfit, v1.profitPercent, v1.roiPercent, v1.breakEvenPrice],
    [25_000, 25_000, 20, 25, 100_000]
  );
  same(
    "V1: the vehicle is identified",
    [v1.source, v1.vehicle.stockNumber, v1.vehicle.status, v1.vehicle.make],
    ["vehicle", V.v1.stockNumber, "available", "Toyota"]
  );
  const v2 = (await post(vehicleProfit(V.v2.id), {}, tok("dealerOwner"))).json;
  same(
    "V2 has no expected price: falls back to the list price",
    [v2.sellingPriceSource, v2.revenue, v2.grossProfit],
    ["listPrice", 70_000, 20_000]
  );
  const priced = (await post(vehicleProfit(V.v1.id), { sellingPrice: 110_000 }, tok("dealerOwner"))).json;
  same(
    "a supplied price overrides the default",
    [priced.sellingPriceSource, priced.grossProfit, priced.profitPercent],
    ["request", 10_000, 9.09]
  );
  const extras = (
    await post(
      vehicleProfit(V.v1.id),
      { additionalCosts: { repair: "2500.50", inspection: 500 }, sellingExpenses: { commissionPercent: 2 } },
      tok("dealerOwner")
    )
  ).json;
  same(
    "planned extra costs are ADDED to the stored ones, exactly",
    [extras.costBreakdown.repair, extras.costBreakdown.inspection, extras.totalCost],
    [7_500.5, 500, 103_000.5]
  );
  same(
    "...and selling expenses apply (2% of 125,000 = 2,500)",
    [extras.sellingExpenses.commission, extras.netProfit],
    [2_500, 19_499.5]
  );
  const sold = await post(vehicleProfit(V.v4.id), {}, tok("dealerOwner"));
  same(
    "a sold vehicle can still be analysed",
    [sold.status, sold.json.vehicle.status, sold.json.totalCost],
    [200, "sold", 60_000]
  );
  // costs are read fresh from the database on every request
  await db.vehicle.update({ where: { id: V.v1.id }, data: { repairCost: 7_000 } });
  const changed = (await post(vehicleProfit(V.v1.id), {}, tok("dealerOwner"))).json;
  same(
    "editing the stored repair cost changes the next result immediately",
    [changed.totalCost, changed.grossProfit],
    [102_000, 23_000]
  );
  await db.vehicle.update({ where: { id: V.v1.id }, data: { repairCost: 5_000 } });

  // the client cannot override the stored costs
  const overrideAttempts: [string, unknown][] = [
    ["costs", { costs: { purchasePrice: 1 } }],
    ["purchasePrice", { purchasePrice: 1 }],
    ["totalCost", { totalCost: 0 }],
    ["netProfit", { netProfit: 1_000_000 }],
    ["additionalCosts.unknown", { additionalCosts: { discountedPurchase: 1 } }],
  ];
  for (const [name, body] of overrideAttempts) {
    const r = await post(vehicleProfit(V.v1.id), body, tok("dealerOwner"));
    ok(
      `a request that tries to set "${name}" is rejected (400)`,
      r.status === 400 && r.json?.code === "validation_error",
      `status ${r.status}`
    );
  }

  // ═════════ 4. tenants and scope ═════════
  const cross = await post(vehicleProfit(yVehicle.id), {}, tok("dealerOwner"));
  const missing = await post(vehicleProfit("does-not-exist"), {}, tok("dealerOwner"));
  ok("another organization's vehicle is a 404", cross.status === 404);
  same(
    "...indistinguishable from a vehicle that does not exist (same status and message)",
    [cross.status, cross.json.message, cross.json.code],
    [missing.status, missing.json.message, missing.json.code]
  );
  const yOwn = await post(vehicleProfit(yVehicle.id), {}, Y.users.dealerOwner.token);
  same("the vehicle's own tenant can analyse it", [yOwn.status, yOwn.json.totalCost], [200, 150_000]);

  const permId = async (key: string) => (await db.permission.findUniqueOrThrow({ where: { key } })).id;
  const analystRole = await db.role.create({
    data: { organizationId: X.org.id, key: `branch_profit_${suffix}`, name: "Branch profit analyst", rank: 20 },
  });
  await db.rolePermission.create({
    data: {
      roleId: analystRole.id,
      organizationId: X.org.id,
      permissionId: await permId("profit:read"),
      scope: "ORGANIZATION",
    },
  });
  await db.rolePermission.create({
    data: {
      roleId: analystRole.id,
      organizationId: X.org.id,
      permissionId: await permId("vehicles:read"),
      scope: "BRANCH",
    },
  });
  const airportAnalyst = await X.mk("airportAnalyst", analystRole.id, [X.airport.id]);
  const lonely = await X.mk("lonelyAnalyst", analystRole.id, []);
  same(
    "branch scope: a vehicle in my branch (Airport) works",
    (await post(vehicleProfit(V.v3.id), {}, airportAnalyst.token)).status,
    200
  );
  same(
    "branch scope: a vehicle in another branch (Downtown) is a 404",
    (await post(vehicleProfit(V.v1.id), {}, airportAnalyst.token)).status,
    404
  );
  same(
    "branch scope with no branch assigned fails closed (404 for every vehicle)",
    [
      (await post(vehicleProfit(V.v3.id), {}, lonely.token)).status,
      (await post(vehicleProfit(V.v1.id), {}, lonely.token)).status,
    ],
    [404, 404]
  );
  same(
    "the stateless calculator needs no vehicle, so the same user may use it",
    (await post(calc, EXAMPLE_B, lonely.token)).status,
    200
  );

  // ═════════ 5. validation: always a 400 with field-level messages, never a 500 ═════════
  const bad: [string, unknown][] = [
    ["empty body", {}],
    ["missing costs", { sellingPrice: 1 }],
    ["missing purchase price", { sellingPrice: 1, costs: {} }],
    ["negative price", { sellingPrice: -1, costs: { purchasePrice: 1 } }],
    ["three decimals", { sellingPrice: 1.005, costs: { purchasePrice: 1 } }],
    ["text amount", { sellingPrice: "abc", costs: { purchasePrice: 1 } }],
    ["exponent amount", { sellingPrice: "1e3", costs: { purchasePrice: 1 } }],
    ["amount over the maximum", { sellingPrice: "1000000000000.01", costs: { purchasePrice: 1 } }],
    [
      "percent over 100",
      { sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { commissionPercent: 100.01 } },
    ],
    ["vat rate over 100", { sellingPrice: 1, vat: { included: true, ratePercent: 101 }, costs: { purchasePrice: 1 } }],
    ["vat without included flag", { sellingPrice: 1, vat: { ratePercent: 5 }, costs: { purchasePrice: 1 } }],
    ["fractional days", { sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { holding: { days: 1.5 } } }],
    ["days over 3650", { sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { holding: { days: 3651 } } }],
    ["unknown top-level key", { sellingPrice: 1, costs: { purchasePrice: 1 }, totalCost: 5 }],
    ["unknown cost key", { sellingPrice: 1, costs: { purchasePrice: 1, discount: 5 } }],
    ["unknown selling-expense key", { sellingPrice: 1, costs: { purchasePrice: 1 }, sellingExpenses: { bonus: 5 } }],
    ["null price", { sellingPrice: null, costs: { purchasePrice: 1 } }],
    ["array body", [1, 2, 3]],
    ["string body", "hello"],
  ];
  for (const [name, body] of bad) {
    const r = await post(calc, body, tok("manager"));
    ok(
      `400 for: ${name}`,
      r.status === 400 && r.json?.code === "validation_error" && Array.isArray(r.json.fieldErrors),
      `status ${r.status} ${r.raw.slice(0, 140)}`
    );
  }
  const notJson = await post(calc, null, tok("manager"), "{not json");
  ok("malformed JSON is a 400", notJson.status === 400 && notJson.json?.code === "invalid_json");
  const many = await post(calc, { sellingPrice: -1, costs: { purchasePrice: "x", repair: 1.234 } }, tok("manager"));
  ok(
    "all field errors are reported at once, with paths",
    many.json.fieldErrors.length >= 3 &&
      many.json.fieldErrors.every((e: { path: string; message: string }) => e.path && e.message),
    JSON.stringify(many.json.fieldErrors)
  );
  const tenantKey = await post(calc, { ...EXAMPLE_B, organizationId: X.org.id }, tok("manager"));
  ok(
    "a tenant key in the body is rejected",
    tenantKey.status === 400 && tenantKey.json.code === "tenant_field_not_allowed"
  );
  const nestedTenantKey = await post(
    vehicleProfit(V.v1.id),
    { sellingExpenses: { dealershipId: X.org.id } },
    tok("dealerOwner")
  );
  ok("...even when nested", nestedTenantKey.status === 400 && nestedTenantKey.json.code === "tenant_field_not_allowed");
  const huge = await post(
    calc,
    {
      sellingPrice: "1000000000000.00",
      costs: { purchasePrice: "999999999999.99" },
      sellingExpenses: { holding: { days: 3650, annualRatePercent: 100, dailyOverhead: "1000" } },
    },
    tok("manager")
  );
  ok("the largest accepted amounts compute without error", huge.status === 200 && Number.isFinite(huge.json.netProfit));
  ok(
    "responses are never cached",
    (
      await fetch(`${BASE}${calc}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${sessionCookieName()}=${tok("manager")}`,
          "x-real-ip": nextIp(),
        },
        body: JSON.stringify(EXAMPLE_B),
      })
    ).headers.get("cache-control") === "no-store"
  );
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nProfit HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Profit HTTP check OK: ${passed} assertions passed.`);
  });
