/**
 * End-to-end check of UAE support and currencies against a real PostgreSQL and the built app:
 *   1. the database: catalog seed, enum values equal the shared lists, every constraint and foreign key
 *      (a bad row is REFUSED by the database itself), and the runtime role can only read reference data;
 *   2. the reference endpoints (/reference/uae, /reference/currencies, /reference/convert) for every role;
 *   3. adding a currency later (rows only, no code change) and a rate change;
 *   4. registration with a currency / emirate, and /auth/me;
 *   5. UAE vehicle data through the AI agent's tools, with tenancy and cost-visibility rules.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:uae-http
 *   (app on :3100, fake AI providers on :54350, throwaway migrated + seeded database; see check:ai-agent-http)
 */
import { createPrismaClient } from "@/server/db/client";
import { runInTenant } from "@/server/db/tenant";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { emirateCodes, vehicleImportSpecs, vehicleSourceTypes } from "@/lib/uae/reference";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
if (!/127\.0\.0\.1|localhost/.test(ownerUrl)) throw new Error("Refusing to run against a non-local database.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const FAKE = process.env.CHECK_FAKE_AI_URL ?? "http://127.0.0.1:54350";
const PASSWORD = "Tr1cky-Horse-Battery-Staple";

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
/** The database (not the app) must refuse this statement. */
const refused = async (name: string, pattern: RegExp, fn: () => Promise<unknown>) => {
  try {
    await fn();
    ok(name, false, "the database accepted it");
  } catch (e) {
    const text = String((e as { message?: string }).message ?? e);
    ok(name, pattern.test(text), text.slice(0, 220));
  }
};

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
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
const get = (p: string, t?: string) => call("GET", p, t);
const post = (p: string, t: string | undefined, b: unknown = {}) => call("POST", p, t, b);
const put = (p: string, t: string | undefined, b: unknown) => call("PUT", p, t, b);

const fakeReset = () => fetch(`${FAKE}/__admin/reset`, { method: "POST", body: "{}" });
async function shownToModel(): Promise<string> {
  const state = (await (await fetch(`${FAKE}/__admin/last?provider=anthropic`)).json()) as {
    last: { body: { messages: { content: unknown }[] } } | null;
  };
  const msgs = state.last?.body.messages ?? [];
  const c = msgs[msgs.length - 1]?.content;
  return Array.isArray(c) ? c.map((b: { content?: string }) => b.content ?? "").join("\n") : "";
}

async function makeOrg(label: string, data: { country?: string; emirate?: "DUBAI"; currency?: string } = {}) {
  const org = await db.organization.create({
    data: {
      name: `${label} ${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.com`,
      timezone: "Asia/Dubai",
      ...data,
    },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const downtown = await db.branch.create({ data: { organizationId: org.id, name: "Downtown" } });
  const users: Record<string, { id: string; token: string }> = {};
  for (const [key, roleId] of [
    ["dealerOwner", roles.dealerOwner],
    ["salesperson", roles.salesperson],
    ["viewer", roles.viewer],
    ["accountant", roles.accountant],
  ] as const) {
    const user = await db.user.create({
      data: {
        organizationId: org.id,
        roleId,
        name: key,
        email: `${key}-${label}-${suffix}@example.com`.toLowerCase(),
        status: "ACTIVE",
      },
    });
    if (key === "salesperson")
      await db.userBranch.create({ data: { userId: user.id, branchId: downtown.id, organizationId: org.id } });
    users[key] = { id: user.id, token: (await createSession(db, { organizationId: org.id, userId: user.id })).token };
  }
  return { org, downtown, users };
}

async function main() {
  const X = await makeOrg("Uaex", { emirate: "DUBAI" });
  const Y = await makeOrg("Uaey");
  const tok = (k: string) => X.users[k].token;

  // ═════════ 1. the database ═════════
  const cur = await db.currency.findMany({ orderBy: { code: "asc" } });
  same(
    "the catalog starts with AED and USD, both enabled, 2 decimals",
    cur.filter((c) => ["AED", "USD"].includes(c.code)).map((c) => [c.code, c.isEnabled, c.minorUnits]),
    [
      ["AED", true, 2],
      ["USD", true, 2],
    ]
  );
  const peg = await db.exchangeRate.findFirst({ where: { baseCurrency: "USD", quoteCurrency: "AED" } });
  ok(
    "the AED peg (1 USD = 3.6725 AED) is seeded with its source",
    peg?.rate.toFixed(4) === "3.6725" && /Central Bank/.test(peg.source)
  );

  const enumValues = async (type: string) =>
    (
      await db.$queryRawUnsafe<{ v: string }[]>(
        `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = '${type}' ORDER BY e.enumsortorder`
      )
    ).map((r) => r.v);
  same("database emirate enum equals the shared list", await enumValues("emirate"), [...emirateCodes]);
  same(
    "database vehicle_import_spec enum equals the shared list",
    (await enumValues("vehicle_import_spec")).sort(),
    [...vehicleImportSpecs].sort()
  );
  same(
    "database vehicle_source_type enum equals the shared list",
    (await enumValues("vehicle_source_type")).sort(),
    [...vehicleSourceTypes].sort()
  );

  const constraints = (
    await db.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conname IN ('organizations_currency_fkey','partner_requests_fee_currency_fkey','vehicles_purchase_currency_fkey','exchange_rates_base_currency_fkey','exchange_rates_quote_currency_fkey','organizations_emirate_chk','vehicles_purchase_original_chk','currencies_minor_units_chk','exchange_rates_rate_chk')`
    )
  ).length;
  same("every currency foreign key and check exists", constraints, 9);

  const Q = (s: string, ...p: unknown[]) => db.$executeRawUnsafe(s, ...p);
  await refused("a currency code must be 3 capital letters", /currencies_code_chk|23514/, () =>
    Q(`INSERT INTO currencies (code, name, symbol) VALUES ('abc', 'x', 'x')`)
  );
  await refused(
    "a 3-decimal currency (KWD) is refused until the money columns can hold it",
    /currencies_minor_units_chk|23514/,
    () => Q(`INSERT INTO currencies (code, name, symbol, minor_units) VALUES ('KWD', 'Kuwaiti Dinar', 'KD', 3)`)
  );
  await refused("a rate needs two different currencies", /exchange_rates_pair_chk|23514/, () =>
    Q(`INSERT INTO exchange_rates VALUES ('USD','USD', now(), 1, 't', now())`)
  );
  await refused("a rate must be positive", /exchange_rates_rate_chk|23514/, () =>
    Q(`INSERT INTO exchange_rates VALUES ('USD','AED', now(), 0, 't', now())`)
  );
  await refused("a rate for an unknown currency is refused", /exchange_rates_quote_currency_fkey|23503/, () =>
    Q(`INSERT INTO exchange_rates VALUES ('USD','QQQ', now(), 2, 't', now())`)
  );
  await refused(
    "the same pair cannot have two answers at one instant (either direction)",
    /exchange_rates_pair_time_key|23505/,
    () => Q(`INSERT INTO exchange_rates VALUES ('AED','USD', '1997-11-01T00:00:00Z', 0.27, 't', now())`)
  );
  await refused("an organization's currency must be in the catalog", /organizations_currency_fkey|23503/, () =>
    Q(`UPDATE organizations SET currency = 'QQQ' WHERE id = $1`, X.org.id)
  );
  await refused("an emirate needs a UAE organization", /organizations_emirate_chk|23514/, () =>
    Q(`UPDATE organizations SET country = 'GB' WHERE id = $1`, X.org.id)
  );

  const veh = (stock: string, extra: Record<string, unknown> = {}) =>
    db.vehicle.create({
      data: {
        organizationId: X.org.id,
        branchId: X.downtown.id,
        stockNumber: `${stock}-${suffix}`,
        make: "Nissan",
        model: "Patrol",
        year: 2021,
        listPrice: 200000,
        purchasePrice: 150000,
        ...extra,
      },
    });
  const v0 = await veh("U0");
  await refused("an unknown vehicle specification is refused", /invalid input value for enum|22P02/, () =>
    Q(`UPDATE vehicles SET import_spec = 'jdm' WHERE id = $1`, v0.id)
  );
  await refused("an unknown vehicle source is refused", /invalid input value for enum|22P02/, () =>
    Q(`UPDATE vehicles SET source_type = 'stolen' WHERE id = $1`, v0.id)
  );
  await refused("an unknown emirate is refused", /invalid input value for enum|22P02/, () =>
    Q(`UPDATE vehicles SET emirate = 'cairo' WHERE id = $1`, v0.id)
  );
  await refused("a purchase currency needs its amount and rate", /vehicles_purchase_original_chk|23514/, () =>
    Q(`UPDATE vehicles SET purchase_currency = 'USD' WHERE id = $1`, v0.id)
  );
  await refused(
    "...and the base-currency price must be exactly amount x rate",
    /vehicles_purchase_original_chk|23514/,
    () =>
      Q(
        `UPDATE vehicles SET purchase_currency='USD', purchase_amount_original=30000, purchase_fx_rate=3.6725, purchase_price=110000 WHERE id = $1`,
        v0.id
      )
  );
  await refused("...and the currency must be in the catalog", /vehicles_purchase_currency_fkey|23503/, () =>
    Q(
      `UPDATE vehicles SET purchase_currency='QQQ', purchase_amount_original=100, purchase_fx_rate=2, purchase_price=200 WHERE id = $1`,
      v0.id
    )
  );
  await Q(
    `UPDATE vehicles SET purchase_currency='USD', purchase_amount_original=30000, purchase_fx_rate=3.6725, purchase_price=110175 WHERE id = $1`,
    v0.id
  );
  const stored = await db.vehicle.findUniqueOrThrow({ where: { id: v0.id } });
  ok(
    "a consistent purchase in USD is accepted and keeps what was agreed",
    stored.purchaseCurrency === "USD" &&
      stored.purchaseAmountOriginal?.toFixed(2) === "30000.00" &&
      stored.purchasePrice.toFixed(2) === "110175.00"
  );

  await refused("the runtime role cannot add a currency", /permission denied/, () =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
      await tx.$executeRawUnsafe(`INSERT INTO currencies (code, name, symbol) VALUES ('ZZZ', 'x', 'x')`);
    })
  );
  await refused("...or change a rate", /permission denied/, () =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
      await tx.$executeRawUnsafe(`UPDATE exchange_rates SET rate = 4`);
    })
  );
  await refused("...or delete one", /permission denied/, () =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
      await tx.$executeRawUnsafe(`DELETE FROM currencies WHERE code = 'USD'`);
    })
  );
  const readable = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE cda_app");
    return tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM currencies`);
  });
  ok("...but it can read them", Number(readable[0].n) >= 2);
  await refused("the tenant client cannot write a currency either", /Tenancy violation|read-only/, () =>
    runInTenant(db, X.org.id, (tx) => tx.currency.create({ data: { code: "ZZZ", name: "x", symbol: "x" } }))
  );
  ok("...but reads them", (await runInTenant(db, X.org.id, (tx) => tx.exchangeRate.count())) >= 1);

  // ═════════ 2. reference endpoints ═════════
  same(
    "no session -> 401 on all three",
    [
      (await get("/api/v1/reference/uae")).status,
      (await get("/api/v1/reference/currencies")).status,
      (await get("/api/v1/reference/convert?amount=1&from=AED&to=USD")).status,
    ],
    [401, 401, 401]
  );
  for (const role of ["dealerOwner", "salesperson", "viewer", "accountant"]) {
    const r = await get("/api/v1/reference/uae", tok(role));
    ok(
      `${role}: /reference/uae is readable`,
      r.status === 200 && r.json.country === "AE" && r.json.timezone === "Asia/Dubai"
    );
  }
  const uae = (await get("/api/v1/reference/uae", tok("viewer"))).json;
  same(
    "the seven emirates",
    uae.emirates.map((e: { code: string }) => e.code),
    [...emirateCodes]
  );
  ok(
    "with English and Arabic names",
    uae.emirates[0].name === "Dubai" && uae.emirates[0].nameAr === "دبي" && uae.emirates[1].name === "Abu Dhabi"
  );
  same(
    "the specifications",
    uae.vehicleImportSpecs.map((s: { code: string }) => s.code).sort(),
    [...vehicleImportSpecs].sort()
  );
  same(
    "the sources",
    uae.vehicleSourceTypes.map((s: { code: string }) => s.code).sort(),
    [...vehicleSourceTypes].sort()
  );
  same(
    "the enabled currencies",
    uae.currencies.map((c: { code: string }) => c.code),
    ["AED", "USD"]
  );
  same("and this dealership's country, base currency and time zone", uae.organization, {
    country: "AE",
    baseCurrency: "AED",
    timezone: "Asia/Dubai",
  });

  const list = (await get("/api/v1/reference/currencies", tok("viewer"))).json;
  same(
    "/reference/currencies: base, currencies, and the current peg",
    [
      list.baseCurrency,
      list.currencies.map((c: { code: string }) => c.code),
      list.rates.map((r: { base: string; quote: string; rate: string }) => `${r.base}>${r.quote}=${r.rate}`),
    ],
    ["AED", ["AED", "USD"], ["USD>AED=3.6725"]]
  );
  ok(
    "...with its source",
    /Central Bank/.test(list.rates[0].source) && list.rates[0].effectiveFrom.startsWith("1997-11-01")
  );

  const conv = (q: string, role = "viewer") => get(`/api/v1/reference/convert?${q}`, tok(role));
  const c1 = await conv("amount=245000&from=AED&to=USD");
  same(
    "245,000 AED = 66,712.05 USD",
    [c1.status, c1.json.to, c1.json.rate],
    [200, { amount: "66712.05", currency: "USD" }, "0.2722940776"]
  );
  same("USD -> AED", (await conv("amount=1000&from=USD&to=AED")).json.to, { amount: "3672.50", currency: "AED" });
  same("lower-case codes are accepted", (await conv("amount=100&from=usd&to=aed")).json.to, {
    amount: "367.25",
    currency: "AED",
  });
  same("the same currency is a no-op", (await conv("amount=12.5&from=AED&to=AED")).json.to, {
    amount: "12.50",
    currency: "AED",
  });
  same("every role may convert (accountant)", (await conv("amount=100&from=USD&to=AED", "accountant")).status, 200);
  const bad = async (q: string) => {
    const r = await conv(q);
    return [r.status, r.json.code];
  };
  const decimals = await conv("amount=12.345&from=AED&to=USD");
  same(
    "a bad amount is a 400 with the field named",
    [await bad("amount=-5&from=AED&to=USD"), decimals.json.fieldErrors?.[0]?.path],
    [[400, "validation_error"], "amount"]
  );
  same(
    "more hostile amounts",
    [
      await bad("amount=1e3&from=AED&to=USD"),
      await bad("amount=&from=AED&to=USD"),
      await bad("amount=abc&from=AED&to=USD"),
      await bad("amount=1000000000001&from=AED&to=USD"),
    ],
    [
      [400, "validation_error"],
      [400, "validation_error"],
      [400, "validation_error"],
      [400, "validation_error"],
    ]
  );
  same(
    "an unknown currency is refused by name",
    [await bad("amount=1&from=AED&to=XYZ"), await bad("amount=1&from=QQ&to=USD")],
    [
      [400, "unsupported_currency"],
      [400, "validation_error"],
    ]
  );
  same(
    "missing parameters, extra parameters, and a bad time are 400s",
    [
      await bad("from=AED&to=USD"),
      await bad("amount=1&from=AED&to=USD&extra=1"),
      await bad("amount=1&from=AED&to=USD&at=yesterday"),
    ],
    [
      [400, "validation_error"],
      [400, "validation_error"],
      [400, "validation_error"],
    ]
  );
  same(
    "a dealership id in the query is rejected, never used",
    await bad(`amount=1&from=AED&to=USD&organizationId=${Y.org.id}`),
    [400, "tenant_field_not_allowed"]
  );
  same(
    "before any rate existed there is no answer (422), not a guess",
    await bad("amount=1&from=AED&to=USD&at=1990-01-01T00:00:00Z"),
    [422, "no_exchange_rate"]
  );

  // ═════════ 3. another currency later: rows only, no code change ═════════
  await db.currency.create({ data: { code: "SAR", name: "Saudi Riyal", symbol: "SAR", isEnabled: false } });
  await db.exchangeRate.create({
    data: {
      baseCurrency: "USD",
      quoteCurrency: "SAR",
      effectiveFrom: new Date("2000-01-01T00:00:00Z"),
      rate: "3.75",
      source: "SAMA peg",
    },
  });
  same("a currency that exists but is not enabled is refused", await bad("amount=1&from=SAR&to=AED"), [
    400,
    "unsupported_currency",
  ]);
  same(
    "...and does not appear in the lists",
    (await get("/api/v1/reference/currencies", tok("viewer"))).json.currencies.map((c: { code: string }) => c.code),
    ["AED", "USD"]
  );
  const reg0 = await post("/api/v1/auth/register", undefined, {
    organizationName: `Sar Motors ${suffix}`,
    name: "Omar Al Test",
    email: `sar-off-${suffix}@example.com`,
    password: PASSWORD,
    currency: "SAR",
  });
  same(
    "...and cannot be chosen as a dealership currency yet",
    [reg0.status, reg0.json.code],
    [400, "unsupported_currency"]
  );
  await db.currency.update({ where: { code: "SAR" }, data: { isEnabled: true } });
  same(
    "enabled: it appears",
    (await get("/api/v1/reference/currencies", tok("viewer"))).json.currencies.map((c: { code: string }) => c.code),
    ["AED", "SAR", "USD"]
  );
  const sar = await conv("amount=1000&from=SAR&to=AED");
  same(
    "SAR -> AED works through USD, rounded once",
    [sar.status, sar.json.to, sar.json.via, sar.json.steps.length],
    [200, { amount: "979.33", currency: "AED" }, "USD", 2]
  );
  same("and USD -> SAR", (await conv("amount=100&from=USD&to=SAR")).json.to, { amount: "375.00", currency: "SAR" });
  await db.exchangeRate.create({
    data: {
      baseCurrency: "USD",
      quoteCurrency: "SAR",
      effectiveFrom: new Date("2030-01-01T00:00:00Z"),
      rate: "3.80",
      source: "test change",
    },
  });
  same(
    "a new rate applies from its date, the old one before it",
    [
      (await conv("amount=100&from=USD&to=SAR&at=2029-12-31T23:59:59Z")).json.to.amount,
      (await conv("amount=100&from=USD&to=SAR&at=2030-01-01T00:00:00Z")).json.to.amount,
      (await conv("amount=100&from=USD&to=SAR")).json.to.amount,
    ],
    ["375.00", "380.00", "375.00"]
  );

  // ═════════ 4. registration and /auth/me ═════════
  const reg = (over: Record<string, unknown>, label: string) =>
    post("/api/v1/auth/register", undefined, {
      organizationName: `Reg ${label} ${suffix}`,
      name: "Omar Al Test",
      email: `reg-${label}-${suffix}@example.com`,
      password: PASSWORD,
      ...over,
    });
  const regUsd = await reg({ currency: "usd", emirate: "sharjah" }, "usd");
  const usdOrg = await db.organization.findFirst({
    where: { email: `reg-usd-${suffix}@example.com` },
    include: { branches: true },
  });
  same(
    "a dealership can register in USD and in an emirate",
    [regUsd.status, usdOrg?.currency, usdOrg?.country, usdOrg?.emirate, usdOrg?.branches[0]?.emirate],
    [202, "USD", "AE", "SHARJAH", "SHARJAH"]
  );
  await reg({}, "default");
  const defOrg = await db.organization.findFirst({ where: { email: `reg-default-${suffix}@example.com` } });
  same(
    "the default is AED in the UAE with no emirate",
    [defOrg?.currency, defOrg?.country, defOrg?.emirate],
    ["AED", "AE", null]
  );
  const regSar = await reg({ currency: "SAR", country: "SA" }, "sar");
  const sarOrg = await db.organization.findFirst({ where: { email: `reg-sar-${suffix}@example.com` } });
  same(
    "a dealership outside the UAE can register in another enabled currency, with no emirate",
    [regSar.status, sarOrg?.currency, sarOrg?.country, sarOrg?.emirate],
    [202, "SAR", "SA", null]
  );
  same("an unknown currency is refused", (await reg({ currency: "XYZ" }, "xyz")).json.code, "unsupported_currency");
  same("an emirate outside the UAE is refused", (await reg({ country: "GB", emirate: "dubai" }, "gb")).status, 400);
  same("an emirate that does not exist is refused", (await reg({ emirate: "cairo" }, "cairo")).status, 400);
  same("a malformed currency is refused", (await reg({ currency: "US" }, "us")).status, 400);
  same(
    "the new organizations were not created by the refused attempts",
    await db.organization.count({
      where: {
        email: {
          in: [
            `reg-xyz-${suffix}@example.com`,
            `reg-gb-${suffix}@example.com`,
            `reg-cairo-${suffix}@example.com`,
            `reg-us-${suffix}@example.com`,
            `sar-off-${suffix}@example.com`,
          ],
        },
      },
    }),
    0
  );

  const meX = (await get("/api/v1/auth/me", tok("dealerOwner"))).json.organization;
  const meY = (await get("/api/v1/auth/me", Y.users.dealerOwner.token)).json.organization;
  same(
    "/auth/me carries the emirate and base currency",
    [meX.emirate, meX.currency, meY.emirate, meY.currency],
    ["dubai", "AED", null, "AED"]
  );

  // ═════════ 5. UAE vehicle data through the AI agent ═════════
  await put("/api/v1/ai/settings", tok("dealerOwner"), { requestsPerUserPerMinute: 600 });
  const g = (stock: string, extra: Record<string, unknown>) => veh(stock, extra);
  const a1 = await g("A1", { emirate: "DUBAI", importSpec: "GCC", sourceType: "DEALER" });
  const a2 = await g("A2", { emirate: "SHARJAH", importSpec: "UAE", sourceType: "AUCTION" });
  const a3 = await g("A3", {
    emirate: "ABU_DHABI",
    importSpec: "IMPORTED",
    sourceType: "IMPORT",
    purchaseCurrency: "USD",
    purchaseAmountOriginal: 30000,
    purchaseFxRate: "3.6725",
    purchasePrice: 110175,
  });
  const a4 = await g("A4", { emirate: "DUBAI", importSpec: "GCC", sourceType: "PRIVATE" });
  const a5 = await g("A5", { emirate: "DUBAI", importSpec: "GCC", sourceType: "EXPORT" });
  await db.vehicle.create({
    data: {
      organizationId: Y.org.id,
      stockNumber: `Y1-${suffix}`,
      make: "Nissan",
      model: "Patrol",
      year: 2021,
      listPrice: 1,
      emirate: "DUBAI",
      importSpec: "GCC",
      sourceType: "DEALER",
    },
  });

  const ask = async (role: string, message: string) => {
    await fakeReset();
    const token = X.users[role].token;
    const c = (await post("/api/v1/ai/conversations", token, {})).json.id as string;
    const r = await post(`/api/v1/ai/agent/conversations/${c}/messages`, token, { content: message });
    return { r, shown: await shownToModel(), call: r.json.assistantMessage?.toolCalls?.[0] };
  };
  const search = async (args: Record<string, unknown>, role = "dealerOwner") => {
    const { shown, call } = await ask(role, `find [[tool:searchVehicles ${JSON.stringify({ ...args, limit: 20 })}]]`);
    if (call?.status !== "ok")
      return { status: call?.status as string, stocks: [] as string[], vehicles: [] as Record<string, unknown>[] };
    const data = JSON.parse(shown);
    return {
      status: "ok",
      stocks: (data.vehicles as { stockNumber: string }[]).map((v) => v.stockNumber.replace(`-${suffix}`, "")).sort(),
      vehicles: data.vehicles as Record<string, unknown>[],
    };
  };
  same("searchVehicles by emirate", (await search({ emirate: "dubai" })).stocks, ["A1", "A4", "A5"]);
  same("...by specification", (await search({ importSpec: "gcc" })).stocks, ["A1", "A4", "A5"]);
  same("...by source", (await search({ sourceType: "auction" })).stocks, ["A2"]);
  same("...by emirate and source together", (await search({ emirate: "dubai", sourceType: "private" })).stocks, ["A4"]);
  same("...with no match", (await search({ emirate: "sharjah", importSpec: "gcc" })).stocks, []);
  same("...imported cars in Abu Dhabi", (await search({ emirate: "abu_dhabi", importSpec: "imported" })).stocks, [
    "A3",
  ]);
  same("...export cars", (await search({ sourceType: "export" })).stocks, ["A5"]);
  const all = await search({});
  ok(
    "another dealership's Dubai / GCC car is never returned",
    !all.stocks.some((s) => s.startsWith("Y1")) && all.stocks.length === 6
  );
  const a1row = all.vehicles.find((v) => String(v.stockNumber).startsWith("A1"));
  same(
    "each result says where the car is and what type it is",
    [a1row?.emirate, a1row?.importSpec, a1row?.sourceType],
    ["dubai", "gcc", "dealer"]
  );
  ok(
    "a car with nothing recorded shows null, not a guess",
    all.vehicles.filter((v) => v.emirate === null && v.importSpec === null).length >= 1
  );
  for (const bad of [{ emirate: "cairo" }, { emirate: "DUBAI" }, { importSpec: "GCC" }, { sourceType: "stolen" }]) {
    same(
      `an invalid filter ${JSON.stringify(bad)} is an error for the model, not a query`,
      (await search(bad)).status,
      "error"
    );
  }

  const gv = async (role: string, stock: string) => {
    const { shown, call } = await ask(
      role,
      `details [[tool:getVehicle ${JSON.stringify({ stockNumber: `${stock}-${suffix}` })}]]`
    );
    return { status: call?.status, shown, data: call?.status === "ok" ? JSON.parse(shown) : null };
  };
  const owner3 = await gv("dealerOwner", "A3");
  same("the owner sees what was paid in USD and the rate applied", owner3.data?.costs?.purchasedIn, {
    currency: "USD",
    amount: 30000,
    exchangeRate: 3.6725,
  });
  same("...next to the converted purchase price", owner3.data?.costs?.purchasePrice, 110175);
  const sp3 = await gv("salesperson", "A3");
  ok(
    "a salesperson (no cost access) sees the type and emirate but nothing about the purchase",
    sp3.status === "ok" &&
      sp3.data.emirate === "abu_dhabi" &&
      sp3.data.importSpec === "imported" &&
      !sp3.data.costs &&
      !/30000|110175|3\.6725|purchasedIn/.test(sp3.shown)
  );
  ok("an unset car has no purchasedIn", !(await gv("dealerOwner", "A1")).data?.costs?.purchasedIn);

  void [a1, a2, a3, a4, a5];

  // clean up the extra currency so reruns and later checks see the launch catalog
  await db.exchangeRate.deleteMany({ where: { quoteCurrency: "SAR" } });
  await db.organization.updateMany({ where: { currency: "SAR" }, data: { currency: "AED" } });
  await db.currency.delete({ where: { code: "SAR" } });
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nUAE HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`UAE HTTP check OK: ${passed} assertions passed.`);
  });
