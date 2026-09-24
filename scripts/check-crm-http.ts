/**
 * End-to-end check of the Vehicles, Customers and Leads endpoints over real HTTP. Run with `npm run check:crm-http`
 * against a RUNNING app (started as the RLS-restricted `cda_app` role, COOKIE_SECURE=false) on a THROWAWAY migrated +
 * base-seeded database (`npm run db:seed` done; this script seeds the demo dealership and writes test data):
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:crm-http
 *
 * Real roles come from the demo dealership (owner, manager, salespeople, buyer, accountant, viewer). Cases the built-in
 * roles cannot express (a branch-scoped role, a role that may edit vehicles but not see costs, a leads-only role) use
 * custom roles in a second organization, which also proves that nothing crosses between organizations.
 */
import { spawnSync } from "node:child_process";
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { DEMO_ORGANIZATION_ID, users as demoUsers } from "../prisma/demo/data";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const ORG = DEMO_ORGANIZATION_ID;
const PASSWORD = "Crm-check-Pw-4471-zk";

const db = createPrismaClient(ownerUrl, { maxConnections: 3 });
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
let ip = 0;
async function call(method: string, path: string, cookie?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": `10.88.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` };
  if (cookie) headers.cookie = cookie;
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
    // not json
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any, raw };
}
const get = (p: string, c?: string) => call("GET", p, c);
const post = (p: string, c: string | undefined, b: unknown) => call("POST", p, c, b);
const put = (p: string, c: string | undefined, b: unknown) => call("PUT", p, c, b);

const emailOf = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@desertfalcon-demo.example`;

function seedDemo() {
  const exists = spawnSync("npx", ["tsx", "prisma/seed-demo.ts", "--reset"], {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DIRECT_DATABASE_URL: ownerUrl, ALLOW_DEMO_SEED: "1", DEMO_USER_PASSWORD: PASSWORD },
  });
  if (exists.status !== 0) throw new Error(`demo seed failed: ${exists.stdout}\n${exists.stderr}`);
}

async function main() {
  seedDemo();
  const login = async (name: string) => {
    const r = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `10.99.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` },
      body: JSON.stringify({ email: emailOf(name), password: PASSWORD }),
    });
    if (r.status !== 200) throw new Error(`login failed for ${name}: ${r.status}`);
    return (r.headers.get("set-cookie") ?? "").split(";")[0];
  };
  const who: Record<string, string> = {};
  for (const u of demoUsers) who[u.key] = await login(u.name);
  const userId = async (key: string) =>
    (
      await db.user.findFirstOrThrow({
        where: { organizationId: ORG, name: demoUsers.find((u) => u.key === key)!.name },
      })
    ).id;

  // ───────────── a second organization with custom roles ─────────────
  const control = await db.organization.create({
    data: { name: `Zulu ${suffix}`, email: `zulu-${suffix}@example.com`, timezone: "Asia/Dubai" },
  });
  await db.$transaction((tx) => provisionOrganizationRoles(tx, control.id));
  const branchA = await db.branch.create({ data: { organizationId: control.id, name: "Branch A", isPrimary: true } });
  const branchB = await db.branch.create({ data: { organizationId: control.id, name: "Branch B" } });
  const perms = new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));
  const customRole = async (
    label: string,
    grants: [string, "OWN" | "BRANCH" | "ORGANIZATION"][],
    branchIds: string[]
  ) => {
    const role = await db.role.create({
      data: {
        organizationId: control.id,
        key: `custom_${label.toLowerCase()}`,
        name: `${label} ${suffix}`,
        isSystem: false,
        rank: 20,
      },
    });
    for (const [key, scope] of grants) {
      const permissionId = perms.get(key);
      if (!permissionId) throw new Error(`no permission ${key}`);
      await db.rolePermission.create({ data: { roleId: role.id, permissionId, organizationId: control.id, scope } });
    }
    const user = await db.user.create({
      data: {
        organizationId: control.id,
        roleId: role.id,
        name: label,
        email: `${label.toLowerCase()}-${suffix}@example.com`,
        status: "ACTIVE",
      },
    });
    for (const branchId of branchIds)
      await db.userBranch.create({ data: { userId: user.id, branchId, organizationId: control.id } });
    const cookie = `${sessionCookieName()}=${(await createSession(db, { organizationId: control.id, userId: user.id })).token}`;
    return { id: user.id, cookie };
  };
  const branchUser = await customRole(
    "Branchy",
    [
      ["vehicles:read", "BRANCH"],
      ["vehicles:create", "BRANCH"],
      ["vehicles:update", "BRANCH"],
    ],
    [branchA.id]
  );
  const noCost = await customRole(
    "Nocost",
    [
      ["vehicles:read", "ORGANIZATION"],
      ["vehicles:create", "ORGANIZATION"],
      ["vehicles:update", "ORGANIZATION"],
    ],
    []
  );
  const leadsOnly = await customRole("Leadsonly", [["leads:read", "ORGANIZATION"]], []);
  const mkVehicle = (branchId: string, make: string) =>
    db.vehicle.create({
      data: {
        organizationId: control.id,
        branchId,
        stockNumber: `Z-${make}-${suffix}`,
        make,
        model: "M",
        year: 2022,
        listPrice: 100_000,
        purchasePrice: 80_000,
        repairCost: 1_000,
        acquiredAt: new Date(Date.now() - 5 * 86_400_000),
      },
    });
  const vA = await mkVehicle(branchA.id, "Aaa");
  const vB = await mkVehicle(branchB.id, "Bbb");
  const zCustomer = await db.customer.create({
    data: {
      organizationId: control.id,
      name: `Secret Person ${suffix}`,
      email: `secret-${suffix}@example.com`,
      phone: "+971 50 000 0999",
    },
  });
  const zLead = await db.lead.create({
    data: {
      organizationId: control.id,
      customerId: zCustomer.id,
      interestedVehicleId: vA.id,
      source: "WEBSITE",
      stage: "NEW",
      assignedToId: noCost.id,
    },
  });

  // ───────────── facts from the database, to compare the API with ─────────────
  const dbVehicles = await db.vehicle.findMany({ where: { organizationId: ORG } });
  const dbCustomers = await db.customer.findMany({ where: { organizationId: ORG } });
  const dbLeads = await db.lead.findMany({ where: { organizationId: ORG } });
  const dbDeals = await db.deal.findMany({ where: { organizationId: ORG } });
  const vehicleByMake = (make: string, model?: string) =>
    dbVehicles.find((v) => v.make === make && (!model || v.model === model))!;
  const lc = vehicleByMake("Toyota", "Land Cruiser");
  const cust = (name: string) => dbCustomers.find((c) => c.name.startsWith(name))!;

  // ═════════════════════════ VEHICLES ═════════════════════════
  const list = await get("/api/v1/vehicles", who.manager);
  ok("vehicles: the manager lists", list.status === 200, list.raw.slice(0, 200));
  same(
    "vehicles: paging metadata",
    [list.json.total, list.json.page, list.json.pageSize, list.json.items.length],
    [dbVehicles.length, 1, 24, 24]
  );
  const page2 = await get("/api/v1/vehicles?page=2", who.manager);
  same("vehicles: page 2 holds the rest", page2.json.items.length, dbVehicles.length - 24);
  ok(
    "vehicles: pages do not overlap",
    !page2.json.items.some((i: { id: string }) => list.json.items.some((j: { id: string }) => j.id === i.id))
  );
  const all = await get("/api/v1/vehicles?pageSize=100", who.manager);
  same("vehicles: pageSize 100 returns all", all.json.items.length, dbVehicles.length);
  same(
    "vehicles: filter by status",
    (await get("/api/v1/vehicles?status=available&pageSize=100", who.manager)).json.total,
    dbVehicles.filter((v) => v.status === "AVAILABLE").length
  );
  same(
    "vehicles: filter by make",
    (await get("/api/v1/vehicles?make=Toyota", who.manager)).json.total,
    dbVehicles.filter((v) => v.make === "Toyota").length
  );
  same(
    "vehicles: filter by emirate",
    (await get("/api/v1/vehicles?emirate=sharjah", who.manager)).json.total,
    dbVehicles.filter((v) => v.emirate === "SHARJAH").length
  );
  same(
    "vehicles: filter by condition",
    (await get("/api/v1/vehicles?condition=certified_pre_owned", who.manager)).json.total,
    dbVehicles.filter((v) => v.condition === "CERTIFIED_PRE_OWNED").length
  );
  same(
    "vehicles: filter by source type",
    (await get("/api/v1/vehicles?sourceType=import", who.manager)).json.total,
    dbVehicles.filter((v) => v.sourceType === "IMPORT").length
  );
  same(
    "vehicles: filter by price range",
    (await get("/api/v1/vehicles?minPrice=100000&maxPrice=200000&pageSize=100", who.manager)).json.total,
    dbVehicles.filter((v) => Number(v.listPrice) >= 100000 && Number(v.listPrice) <= 200000).length
  );
  same("vehicles: search by model text", (await get("/api/v1/vehicles?search=cruiser", who.manager)).json.total, 2);
  same(
    "vehicles: search by VIN fragment",
    (await get(`/api/v1/vehicles?search=${lc.vin!.slice(0, 12)}`, who.manager)).json.items
      .map((i: { id: string }) => i.id)
      .includes(lc.id),
    true
  );
  same(
    "vehicles: search by stock number",
    (await get(`/api/v1/vehicles?search=${lc.stockNumber}`, who.manager)).json.total,
    1
  );
  same(
    "vehicles: a search with a wildcard is just text",
    (await get("/api/v1/vehicles?search=%25", who.manager)).json.total,
    0
  );
  const cheapest = await get("/api/v1/vehicles?sortBy=price&sortDirection=asc&pageSize=1", who.manager);
  same(
    "vehicles: sort by price ascending",
    cheapest.json.items[0].listPrice,
    Math.min(...dbVehicles.map((v) => Number(v.listPrice)))
  );
  const dearest = await get("/api/v1/vehicles?sortBy=price&pageSize=1", who.manager);
  same(
    "vehicles: sort by price descending (default direction)",
    dearest.json.items[0].listPrice,
    Math.max(...dbVehicles.map((v) => Number(v.listPrice)))
  );
  const oldest = await get("/api/v1/vehicles?sortBy=daysInStock&pageSize=1", who.manager);
  same(
    "vehicles: most days in stock first",
    oldest.json.items[0].id,
    [...dbVehicles].sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime())[0].id
  );
  const newest = await get("/api/v1/vehicles?sortBy=year&sortDirection=asc&pageSize=1", who.manager);
  same("vehicles: sort by year", newest.json.items[0].year, Math.min(...dbVehicles.map((v) => v.year)));
  for (const q of [
    "pageSize=101",
    "pageSize=0",
    "page=0",
    "status=nonsense",
    "sortBy=cost",
    "unknown=1",
    "minPrice=-5",
    "emirate=mars",
    "search=" + "x".repeat(101),
  ]) {
    same(
      `vehicles: bad query "${q.slice(0, 30)}" is a 400`,
      (await get(`/api/v1/vehicles?${q}`, who.manager)).status,
      400
    );
  }
  same(
    "vehicles: a tenant key in the query is refused",
    (await get("/api/v1/vehicles?organizationId=x", who.manager)).status,
    400
  );

  const lcDto = (await get(`/api/v1/vehicles/${lc.id}`, who.manager)).json;
  same(
    "vehicles: detail matches the database",
    [
      lcDto.make,
      lcDto.model,
      lcDto.trim,
      lcDto.year,
      lcDto.listPrice,
      lcDto.currency,
      lcDto.status,
      lcDto.stockNumber,
      lcDto.vin,
    ],
    [lc.make, lc.model, lc.trim, lc.year, Number(lc.listPrice), "AED", "available", lc.stockNumber, lc.vin]
  );
  same("vehicles: days in stock is the calendar-day count", lcDto.daysInStock, 21);
  same(
    "vehicles: enums are lower case",
    [lcDto.condition, lcDto.emirate, lcDto.importSpec, lcDto.sourceType],
    ["new", "dubai", "gcc", "dealer"]
  );
  same("vehicles: the branch is named", lcDto.branch?.name, "Downtown Dubai Showroom");
  ok(
    "vehicles: spec and registration are documents",
    lcDto.spec.engine === "3.5L V6 Twin-Turbo" &&
      lcDto.spec.horsepower === 409 &&
      lcDto.registration.status === "not_registered" &&
      lcDto.featured === true
  );
  same(
    "vehicles: the cost block has the four costs",
    lcDto.costs && [
      lcDto.costs.purchasePrice,
      lcDto.costs.repairCost,
      lcDto.costs.transportCost,
      lcDto.costs.otherCost,
    ],
    [248000, 0, 3500, 0]
  );
  const f150 = vehicleByMake("Ford", "F-150");
  const f150Dto = (await get(`/api/v1/vehicles/${f150.id}`, who.manager)).json;
  same("vehicles: a USD import carries its original amount and rate", f150Dto.costs.purchaseOriginal, {
    currency: "USD",
    amount: 50900,
    fxRate: 3.6725,
  });
  const pajero = (await get(`/api/v1/vehicles/${vehicleByMake("Mitsubishi").id}`, who.manager)).json;
  ok(
    "vehicles: location and notes come through",
    pajero.location === "RAK Workshop Yard" && pajero.notes?.includes("differential")
  );
  // who may see the costs
  for (const role of ["owner", "manager", "buyer"])
    ok(`vehicles: ${role} sees costs`, (await get(`/api/v1/vehicles/${lc.id}`, who[role])).json.costs !== null);
  for (const role of ["sales1", "viewer"]) {
    const r = await get(`/api/v1/vehicles/${lc.id}`, who[role]);
    ok(
      `vehicles: ${role} reads the vehicle but costs are null (not 0)`,
      r.status === 200 && r.json.costs === null && !("purchasePrice" in r.json),
      r.raw.slice(0, 200)
    );
    ok(
      `vehicles: ${role}'s list never carries a cost`,
      (await get("/api/v1/vehicles?pageSize=100", who[role])).json.items.every(
        (i: { costs: unknown }) => i.costs === null
      )
    );
  }
  same(
    "vehicles: the accountant holds no vehicles permission",
    (await get("/api/v1/vehicles", who.accountant)).status,
    403
  );
  const makes = await get("/api/v1/vehicles/makes", who.sales1);
  same("vehicles: makes are distinct and sorted", makes.json, [...new Set(dbVehicles.map((v) => v.make))].sort());
  same("vehicles: an unknown id is a 404", (await get("/api/v1/vehicles/nope", who.manager)).status, 404);
  same(
    "vehicles: another organization's vehicle is a 404",
    (await get(`/api/v1/vehicles/${vA.id}`, who.manager)).status,
    404
  );
  same("vehicles: and the other way round", (await get(`/api/v1/vehicles/${lc.id}`, noCost.cookie)).status, 404);
  same("vehicles: without a session it is a 401", (await get(`/api/v1/vehicles/${lc.id}`)).status, 401);

  // branch scope
  const scoped = await get("/api/v1/vehicles?pageSize=100", branchUser.cookie);
  same(
    "vehicles: a branch-scoped role sees only its branch",
    scoped.json.items.map((i: { id: string }) => i.id),
    [vA.id]
  );
  same(
    "vehicles: another branch's vehicle is a 404 for it",
    (await get(`/api/v1/vehicles/${vB.id}`, branchUser.cookie)).status,
    404
  );
  same(
    "vehicles: it cannot update another branch's vehicle",
    (await put(`/api/v1/vehicles/${vB.id}`, branchUser.cookie, { listPrice: 1 })).status,
    404
  );
  const scopedCreate = await post("/api/v1/vehicles", branchUser.cookie, {
    make: "Own",
    model: "Branch",
    year: 2024,
    condition: "used",
    listPrice: 50000,
  });
  ok(
    "vehicles: it files a new vehicle under its own branch",
    scopedCreate.status === 201 && scopedCreate.json.branch?.id === branchA.id,
    scopedCreate.raw.slice(0, 200)
  );
  same(
    "vehicles: it cannot file one in another branch",
    (
      await post("/api/v1/vehicles", branchUser.cookie, {
        make: "X",
        model: "Y",
        year: 2024,
        condition: "used",
        listPrice: 1,
        branchId: branchB.id,
      })
    ).status,
    404
  );

  // creating
  const created = await post("/api/v1/vehicles", who.manager, {
    make: "Toyota",
    model: "Camry",
    year: 2025,
    condition: "new",
    listPrice: 99000.456,
    trim: "SE",
    vin: " abc12345678 ",
    purchasePrice: 81000,
    mileageKm: 10,
    emirate: "dubai",
    importSpec: "gcc",
    sourceType: "dealer",
    spec: { engine: "2.5L", horsepower: 203, fuelType: "hybrid", seats: 5 },
    registration: { status: "not_registered" },
    notes: "Fresh arrival",
    featured: true,
  });
  ok("vehicles: the manager creates one", created.status === 201, created.raw.slice(0, 300));
  const c = created.json;
  ok("vehicles: a stock number is generated", /^STK-\d{5}$/.test(c.stockNumber), c.stockNumber);
  same(
    "vehicles: the price is rounded to 2 decimals, the VIN trimmed and upper-cased",
    [c.listPrice, c.vin],
    [99000.46, "ABC12345678"]
  );
  same(
    "vehicles: what was sent comes back",
    [c.status, c.spec.fuelType, c.notes, c.featured, c.costs.purchasePrice],
    ["available", "hybrid", "Fresh arrival", true, 81000]
  );
  const createdRow = await db.vehicle.findUniqueOrThrow({ where: { id: c.id } });
  same("vehicles: the row belongs to the caller's organization", createdRow.organizationId, ORG);
  const createdAudit = await db.auditLog.findFirst({
    where: { organizationId: ORG, action: "vehicle.created", entityId: c.id },
  });
  ok("vehicles: creation is audited", !!createdAudit && createdAudit.actorName === "Layla Hassan");
  const c2 = await post("/api/v1/vehicles", who.buyer, {
    make: "Toyota",
    model: "Corolla",
    year: 2024,
    condition: "used",
    listPrice: 70000,
  });
  ok(
    "vehicles: the next generated stock number is different",
    c2.status === 201 && c2.json.stockNumber !== c.stockNumber,
    c2.raw.slice(0, 200)
  );
  same(
    "vehicles: a salesperson cannot create",
    (await post("/api/v1/vehicles", who.sales1, { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1 }))
      .status,
    403
  );
  same(
    "vehicles: a viewer cannot create",
    (await post("/api/v1/vehicles", who.viewer, { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1 }))
      .status,
    403
  );
  same(
    "vehicles: a duplicate VIN is a 409",
    (
      await post("/api/v1/vehicles", who.manager, {
        make: "A",
        model: "B",
        year: 2024,
        condition: "new",
        listPrice: 1,
        vin: "abc12345678",
      })
    ).status,
    409
  );
  same(
    "vehicles: a duplicate stock number is a 409",
    (
      await post("/api/v1/vehicles", who.manager, {
        make: "A",
        model: "B",
        year: 2024,
        condition: "new",
        listPrice: 1,
        stockNumber: lc.stockNumber,
      })
    ).status,
    409
  );
  const sold = await post("/api/v1/vehicles", who.manager, {
    make: "A",
    model: "B",
    year: 2024,
    condition: "new",
    listPrice: 1,
    status: "sold",
  });
  ok(
    "vehicles: creating one as sold is refused (a sale completes a deal)",
    sold.status === 409 && sold.json.code === "business_rule",
    sold.raw.slice(0, 200)
  );
  const bad: [string, unknown][] = [
    ["a tenant key", { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1, organizationId: "x" }],
    ["an unknown key", { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1, acquiredAt: "2020-01-01" }],
    ["a missing make", { model: "B", year: 2024, condition: "new", listPrice: 1 }],
    ["a year out of range", { make: "A", model: "B", year: 1800, condition: "new", listPrice: 1 }],
    ["a negative price", { make: "A", model: "B", year: 2024, condition: "new", listPrice: -1 }],
    ["a price as text", { make: "A", model: "B", year: 2024, condition: "new", listPrice: "1" }],
    ["an absurd price", { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1e15 }],
    ["a bad condition", { make: "A", model: "B", year: 2024, condition: "mint", listPrice: 1 }],
    ["a VIN with spaces", { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1, vin: "ABC 123 456" }],
    [
      "notes that are too long",
      { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1, notes: "n".repeat(4001) },
    ],
    [
      "an unknown spec key",
      { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1, spec: { turbo: true } },
    ],
    [
      "a bad fuel type",
      { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1, spec: { fuelType: "steam" } },
    ],
    [
      "a bad expiry date",
      { make: "A", model: "B", year: 2024, condition: "new", listPrice: 1, registration: { expiryDate: "tomorrow" } },
    ],
    ["an array as the body", [1, 2]],
  ];
  for (const [name, body] of bad)
    same(`vehicles: ${name} is a 400`, (await post("/api/v1/vehicles", who.manager, body)).status, 400);

  // updating
  const upd = await put(`/api/v1/vehicles/${c.id}`, who.manager, {
    listPrice: 95000,
    spec: { engine: "2.5L Hybrid", fuelType: "hybrid" },
    notes: null,
    status: "reserved",
  });
  ok(
    "vehicles: the manager updates",
    upd.status === 200 && upd.json.listPrice === 95000 && upd.json.notes === null && upd.json.status === "reserved",
    upd.raw.slice(0, 300)
  );
  same("vehicles: the spec document is replaced as a whole", Object.keys(upd.json.spec).sort(), ["engine", "fuelType"]);
  const updAudit = await db.auditLog.findFirst({
    where: { organizationId: ORG, action: "vehicle.updated", entityId: c.id },
  });
  ok(
    "vehicles: the update is audited with field names only",
    !!updAudit &&
      String((updAudit.metadata as { fields?: string }).fields).includes("listPrice") &&
      !JSON.stringify(updAudit.metadata).includes("95000"),
    JSON.stringify(updAudit?.metadata)
  );
  await put(`/api/v1/vehicles/${c.id}`, who.manager, { status: "archived" });
  ok(
    "vehicles: archiving (this app's only 'delete') is audited as vehicle.archived, not vehicle.updated (§0.25/§0.26)",
    !!(await db.auditLog.findFirst({ where: { organizationId: ORG, action: "vehicle.archived", entityId: c.id } }))
  );
  const dropUsd = await put(`/api/v1/vehicles/${f150.id}`, who.manager, { purchasePrice: 190000 });
  ok(
    "vehicles: a new purchase price clears the USD record it no longer explains",
    dropUsd.status === 200 &&
      dropUsd.json.costs.purchaseOriginal === null &&
      dropUsd.json.costs.purchasePrice === 190000,
    dropUsd.raw.slice(0, 300)
  );
  const soldVehicle = vehicleByMake("Jeep");
  same(
    "vehicles: a sold vehicle cannot be edited",
    (await put(`/api/v1/vehicles/${soldVehicle.id}`, who.manager, { notes: "x" })).json.code,
    "business_rule"
  );
  same(
    "vehicles: nor made sold by an edit",
    (await put(`/api/v1/vehicles/${c.id}`, who.manager, { status: "sold" })).status,
    409
  );
  same("vehicles: an empty update is a 400", (await put(`/api/v1/vehicles/${c.id}`, who.manager, {})).status, 400);
  same(
    "vehicles: a tenant key in an update is a 400",
    (await put(`/api/v1/vehicles/${c.id}`, who.manager, { organizationId: "x" })).status,
    400
  );
  same(
    "vehicles: a viewer cannot update",
    (await put(`/api/v1/vehicles/${c.id}`, who.viewer, { notes: "x" })).status,
    403
  );
  same(
    "vehicles: a salesperson cannot update",
    (await put(`/api/v1/vehicles/${c.id}`, who.sales1, { notes: "x" })).status,
    403
  );
  same(
    "vehicles: another organization's vehicle cannot be updated",
    (await put(`/api/v1/vehicles/${vA.id}`, who.manager, { notes: "x" })).status,
    404
  );
  same(
    "vehicles: a duplicate VIN in an update is a 409",
    (await put(`/api/v1/vehicles/${c2.json.id}`, who.manager, { vin: "ABC12345678" })).status,
    409
  );

  // costs: a role that may edit vehicles but does not hold profit:read
  const zRead = await get(`/api/v1/vehicles/${vA.id}`, noCost.cookie);
  ok("vehicles: a no-cost role reads the vehicle, costs null", zRead.status === 200 && zRead.json.costs === null);
  same(
    "vehicles: it cannot set a cost when creating",
    (
      await post("/api/v1/vehicles", noCost.cookie, {
        make: "A",
        model: "B",
        year: 2024,
        condition: "new",
        listPrice: 1,
        purchasePrice: 5,
      })
    ).status,
    403
  );
  same(
    "vehicles: it cannot change a cost",
    (await put(`/api/v1/vehicles/${vA.id}`, noCost.cookie, { repairCost: 5 })).status,
    403
  );
  const noCostCreate = await post("/api/v1/vehicles", noCost.cookie, {
    make: "A",
    model: "B",
    year: 2024,
    condition: "new",
    listPrice: 1,
  });
  ok(
    "vehicles: it can create without costs, and gets none back",
    noCostCreate.status === 201 && noCostCreate.json.costs === null
  );
  ok(
    "vehicles: it can change a price",
    (await put(`/api/v1/vehicles/${vA.id}`, noCost.cookie, { listPrice: 111000 })).json.listPrice === 111000
  );
  same(
    "vehicles: its edit left the costs alone",
    Number((await db.vehicle.findUniqueOrThrow({ where: { id: vA.id } })).purchasePrice),
    80000
  );

  // ═════════════════════════ CUSTOMERS ═════════════════════════
  const cl = await get("/api/v1/customers?pageSize=100", who.manager);
  same(
    "customers: the manager lists all",
    [cl.status, cl.json.total, cl.json.items.length],
    [200, dbCustomers.length, dbCustomers.length]
  );
  ok(
    "customers: names are ordered",
    cl.json.items.every(
      (it: { name: string }, i: number, arr: { name: string }[]) =>
        i === 0 || arr[i - 1].name.toLowerCase() <= it.name.toLowerCase()
    )
  );
  same(
    "customers: search by name",
    (await get("/api/v1/customers?search=kaabi", who.manager)).json.items.map((i: { name: string }) => i.name),
    ["Noura Al Kaabi"]
  );
  same("customers: search by e-mail", (await get("/api/v1/customers?search=chloe.dubois", who.manager)).json.total, 1);
  same(
    "customers: search by phone",
    (
      await get(`/api/v1/customers?search=${encodeURIComponent(cust("Ahmed").phone!.slice(-6))}`, who.manager)
    ).json.items.some((i: { name: string }) => i.name === "Ahmed Al Mazrouei"),
    true
  );
  same(
    "customers: paging",
    (await get("/api/v1/customers?pageSize=7&page=3", who.manager)).json.items.length,
    dbCustomers.length - 14
  );
  same("customers: bad query", (await get("/api/v1/customers?pageSize=500", who.manager)).status, 400);
  const completedFor = (customerId: string, salesperson?: string) =>
    dbDeals
      .filter(
        (d) =>
          d.customerId === customerId && d.status === "COMPLETED" && (!salesperson || d.salespersonId === salesperson)
      )
      .reduce((s, d) => s + Number(d.salePrice), 0);
  const aisha = cust("Aisha");
  const james = cust("James");
  const yousefId = await userId("sales1");
  const mDetail = (await get(`/api/v1/customers/${aisha.id}`, who.manager)).json;
  same("customers: lifetime value is the sum of completed deals", mDetail.lifetimeValue, completedFor(aisha.id));
  ok("customers: Aisha has bought something", mDetail.lifetimeValue > 0);
  same(
    "customers: the record matches the database",
    [mDetail.name, mDetail.email, mDetail.phone],
    [aisha.name, aisha.email, aisha.phone]
  );
  same(
    "customers: the accountant sees the same value",
    (await get(`/api/v1/customers/${aisha.id}`, who.accountant)).json.lifetimeValue,
    completedFor(aisha.id)
  );
  same(
    "customers: a salesperson sees only the deals they made (Aisha's was someone else's)",
    (await get(`/api/v1/customers/${aisha.id}`, who.sales1)).json.lifetimeValue,
    0
  );
  same(
    "customers: ...and their own in full (James)",
    (await get(`/api/v1/customers/${james.id}`, who.sales1)).json.lifetimeValue,
    completedFor(james.id, yousefId)
  );
  same(
    "customers: the list carries the same scoped value",
    (await get("/api/v1/customers?pageSize=100", who.sales1)).json.items.find((i: { id: string }) => i.id === aisha.id)
      .lifetimeValue,
    0
  );
  same(
    "customers: a customer with no purchase is worth 0",
    (await get(`/api/v1/customers/${cust("Chloe").id}`, who.manager)).json.lifetimeValue,
    0
  );
  for (const role of ["buyer", "viewer"])
    same(`customers: ${role} holds no customers permission`, (await get("/api/v1/customers", who[role])).status, 403);
  same("customers: an unknown id is a 404", (await get("/api/v1/customers/nope", who.manager)).status, 404);
  same(
    "customers: another organization's customer is a 404",
    (await get(`/api/v1/customers/${zCustomer.id}`, who.manager)).status,
    404
  );
  same("customers: without a session it is a 401", (await get("/api/v1/customers")).status, 401);

  const newCustomer = await post("/api/v1/customers", who.sales1, {
    name: "  Test Person  ",
    email: "  Test.Person@Example.COM ",
    phone: "+971 50 000 0888",
  });
  ok(
    "customers: a salesperson creates one (name trimmed, e-mail lower-cased)",
    newCustomer.status === 201 &&
      newCustomer.json.name === "Test Person" &&
      newCustomer.json.email === "test.person@example.com",
    newCustomer.raw.slice(0, 200)
  );
  same("customers: a new customer is worth 0", newCustomer.json.lifetimeValue, 0);
  const custAudit = await db.auditLog.findFirst({
    where: { organizationId: ORG, action: "customer.created", entityId: newCustomer.json.id },
  });
  ok(
    "customers: creation is audited without personal details",
    !!custAudit && !JSON.stringify(custAudit.metadata).includes("Test")
  );
  same("customers: a viewer cannot create", (await post("/api/v1/customers", who.viewer, { name: "X" })).status, 403);
  same(
    "customers: the accountant (read only) cannot create",
    (await post("/api/v1/customers", who.accountant, { name: "X" })).status,
    403
  );
  for (const [name, body] of [
    ["a missing name", {}],
    ["an invalid e-mail", { name: "X", email: "nope" }],
    ["a tenant key", { name: "X", organizationId: "y" }],
    ["an unknown key", { name: "X", tags: ["vip"] }],
    ["a long name", { name: "n".repeat(121) }],
    ["a long phone", { name: "X", phone: "1".repeat(41) }],
  ] as [string, unknown][]) {
    same(`customers: ${name} is a 400`, (await post("/api/v1/customers", who.manager, body)).status, 400);
  }
  const cUpd = await put(`/api/v1/customers/${newCustomer.json.id}`, who.manager, {
    phone: null,
    name: "Renamed Person",
  });
  ok(
    "customers: an update changes and clears fields",
    cUpd.status === 200 &&
      cUpd.json.phone === null &&
      cUpd.json.name === "Renamed Person" &&
      cUpd.json.email === "test.person@example.com"
  );
  same(
    "customers: an empty update is a 400",
    (await put(`/api/v1/customers/${newCustomer.json.id}`, who.manager, {})).status,
    400
  );
  same(
    "customers: a viewer cannot update",
    (await put(`/api/v1/customers/${newCustomer.json.id}`, who.viewer, { name: "x" })).status,
    403
  );
  same(
    "customers: another organization's customer cannot be updated",
    (await put(`/api/v1/customers/${zCustomer.id}`, who.manager, { name: "x" })).status,
    404
  );

  // ═════════════════════════ LEADS ═════════════════════════
  const ll = await get("/api/v1/leads?pageSize=200", who.manager);
  same("leads: the manager sees every lead", [ll.status, ll.json.total], [200, dbLeads.length]);
  same(
    "leads: the owner sees every lead",
    (await get("/api/v1/leads?pageSize=200", who.owner)).json.total,
    dbLeads.length
  );
  const mine = dbLeads.filter((l) => l.assignedToId === yousefId);
  const yl = await get("/api/v1/leads?pageSize=200", who.sales1);
  same(
    "leads: a salesperson sees only their own",
    yl.json.items.map((i: { id: string }) => i.id).sort(),
    mine.map((l) => l.id).sort()
  );
  ok(
    "leads: those are all assigned to them",
    yl.json.items.every((i: { assignedTo: { id: string } }) => i.assignedTo.id === yousefId)
  );
  for (const role of ["viewer", "buyer", "accountant"])
    same(`leads: ${role} holds no leads permission`, (await get("/api/v1/leads", who[role])).status, 403);
  same(
    "leads: filter by stage",
    (await get("/api/v1/leads?stage=won", who.manager)).json.total,
    dbLeads.filter((l) => l.stage === "WON").length
  );
  same(
    "leads: filter by assignee",
    (await get(`/api/v1/leads?assignedToId=${yousefId}&pageSize=200`, who.manager)).json.total,
    mine.length
  );
  same(
    "leads: search by customer name",
    (await get("/api/v1/leads?search=petrova", who.manager)).json.total,
    dbLeads.filter((l) => l.customerId === cust("Elena").id).length
  );
  ok("leads: search by vehicle make", (await get("/api/v1/leads?search=bentley", who.manager)).json.total >= 1);
  same(
    "leads: a salesperson's search stays inside their leads",
    (await get("/api/v1/leads?search=petrova", who.sales1)).json.total,
    mine.filter((l) => l.customerId === cust("Elena").id).length
  );
  same("leads: bad stage", (await get("/api/v1/leads?stage=hot", who.manager)).status, 400);
  same("leads: pageSize over 200", (await get("/api/v1/leads?pageSize=201", who.manager)).status, 400);
  const sample = dbLeads.find((l) => l.stage === "NEGOTIATION" && l.assignedToId === yousefId)!;
  const sDto = (await get(`/api/v1/leads/${sample.id}`, who.sales1)).json;
  same(
    "leads: detail carries the customer, vehicle, budget and assignee",
    [sDto.customer.name, sDto.assignedTo.name, sDto.stage, sDto.score, sDto.budget, sDto.currency],
    [
      dbCustomers.find((x) => x.id === sample.customerId)!.name,
      "Yousef Karim",
      "negotiation",
      sample.score,
      Number(sample.budget),
      "AED",
    ]
  );
  ok(
    "leads: the vehicle is labelled",
    typeof sDto.interestedVehicle?.label === "string" &&
      sDto.interestedVehicle.label.includes(String(dbVehicles.find((v) => v.id === sample.interestedVehicleId)!.year))
  );
  const others = dbLeads.find((l) => l.assignedToId !== yousefId)!;
  same(
    "leads: someone else's lead is a 404 for a salesperson",
    (await get(`/api/v1/leads/${others.id}`, who.sales1)).status,
    404
  );
  same(
    "leads: another organization's lead is a 404",
    (await get(`/api/v1/leads/${zLead.id}`, who.manager)).status,
    404
  );
  same(
    "leads: a salesperson cannot update someone else's lead",
    (await put(`/api/v1/leads/${others.id}`, who.sales1, { stage: "lost" })).status,
    404
  );

  // a role that may read leads but not customers or vehicles
  const lo = await get("/api/v1/leads", leadsOnly.cookie);
  const zl = lo.json.items[0];
  ok(
    "leads: a leads-only role sees the lead without the customer's details",
    lo.status === 200 &&
      lo.json.total === 1 &&
      zl.customer.name === null &&
      zl.customer.email === null &&
      zl.customer.phone === null &&
      zl.interestedVehicle.label === null,
    lo.raw.slice(0, 300)
  );
  same(
    "leads: ...and cannot find the customer by searching for their name",
    (await get(`/api/v1/leads?search=Secret`, leadsOnly.cookie)).json.total,
    0
  );
  same(
    "leads: ...or by their e-mail",
    (await get(`/api/v1/leads?search=secret-${suffix}`, leadsOnly.cookie)).json.total,
    0
  );
  same("leads: ...or their phone", (await get("/api/v1/leads?search=999", leadsOnly.cookie)).json.total, 0);

  // creating
  const noura = cust("Noura");
  const escalade = vehicleByMake("Cadillac");
  const nooraId = await userId("sales2");
  const nl = await post("/api/v1/leads", who.sales1, {
    customerId: noura.id,
    source: "phone",
    interestedVehicleId: escalade.id,
    budget: 340000.999,
    nextFollowUpAt: "2030-01-01T09:00:00+04:00",
  });
  ok("leads: a salesperson creates one", nl.status === 201, nl.raw.slice(0, 300));
  same(
    "leads: it starts new, scored 30, assigned to its creator",
    [nl.json.stage, nl.json.score, nl.json.assignedTo.id, nl.json.budget],
    ["new", 30, yousefId, 340001]
  );
  same("leads: its follow-up is stored as an instant", nl.json.nextFollowUpAt, "2030-01-01T05:00:00.000Z");
  const nlRow = await db.lead.findUniqueOrThrow({ where: { id: nl.json.id } });
  same(
    "leads: it is filed under the vehicle's branch in the caller's organization",
    [nlRow.organizationId, nlRow.branchId],
    [ORG, escalade.branchId]
  );
  ok(
    "leads: the creation is audited",
    !!(await db.auditLog.findFirst({ where: { organizationId: ORG, action: "lead.created", entityId: nl.json.id } }))
  );
  same(
    "leads: a salesperson cannot assign a lead to someone else",
    (await post("/api/v1/leads", who.sales1, { customerId: noura.id, source: "phone", assignedToId: nooraId })).status,
    403
  );
  const assigned = await post("/api/v1/leads", who.manager, {
    customerId: noura.id,
    source: "walk_in",
    assignedToId: nooraId,
  });
  ok(
    "leads: a manager can assign to a colleague",
    assigned.status === 201 && assigned.json.assignedTo.id === nooraId,
    assigned.raw.slice(0, 200)
  );
  // ── real notifications (§27): "New lead" and "Vehicle price change" ──
  const newLeadNotif = await db.notification.findFirst({
    where: { organizationId: ORG, userId: nooraId, kind: "LEAD", link: `/leads/${assigned.json.id}` },
  });
  ok("notifications: assigning a lead to someone else notifies them of the new lead", !!newLeadNotif, JSON.stringify(newLeadNotif));
  same(
    "notifications: self-assigning your own lead (the default) does not notify yourself",
    await db.notification.count({ where: { organizationId: ORG, userId: yousefId, kind: "LEAD", link: `/leads/${nl.json.id}` } }),
    0
  );
  const priceUpdate = await put(`/api/v1/vehicles/${escalade.id}`, who.manager, { listPrice: Number(escalade.listPrice) + 1234 });
  ok("notifications: the price-change vehicle update succeeds", priceUpdate.status === 200, priceUpdate.raw.slice(0, 200));
  const priceNotif = await db.notification.findFirst({
    where: { organizationId: ORG, userId: yousefId, kind: "PRICE", link: `/inventory/${escalade.id}` },
  });
  ok(
    "notifications: a price change on a vehicle a lead is interested in notifies that lead's assignee",
    !!priceNotif,
    JSON.stringify(priceNotif)
  );
  const priceNotifCountBefore = await db.notification.count({ where: { organizationId: ORG, kind: "PRICE" } });
  const priceUpdateNoop = await put(`/api/v1/vehicles/${escalade.id}`, who.manager, { notes: "no price change here" });
  ok("notifications: an update that does not touch listPrice sends no price notification", priceUpdateNoop.status === 200);
  same(
    "...(PRICE notification count is unchanged)",
    await db.notification.count({ where: { organizationId: ORG, kind: "PRICE" } }),
    priceNotifCountBefore
  );
  same(
    "leads: an unknown customer is a 404",
    (await post("/api/v1/leads", who.manager, { customerId: "nope", source: "phone" })).status,
    404
  );
  same(
    "leads: another organization's customer is a 404",
    (await post("/api/v1/leads", who.manager, { customerId: zCustomer.id, source: "phone" })).status,
    404
  );
  same(
    "leads: another organization's vehicle is a 404",
    (await post("/api/v1/leads", who.manager, { customerId: noura.id, source: "phone", interestedVehicleId: vA.id }))
      .status,
    404
  );
  same(
    "leads: another organization's user cannot be assigned",
    (await post("/api/v1/leads", who.manager, { customerId: noura.id, source: "phone", assignedToId: noCost.id }))
      .status,
    404
  );
  same(
    "leads: a viewer cannot create",
    (await post("/api/v1/leads", who.viewer, { customerId: noura.id, source: "phone" })).status,
    403
  );
  for (const [name, body] of [
    ["a missing source", { customerId: noura.id }],
    ["a bad source", { customerId: noura.id, source: "billboard" }],
    ["a tenant key", { customerId: noura.id, source: "phone", organizationId: "x" }],
    ["a stage on create", { customerId: noura.id, source: "phone", stage: "won" }],
    ["a score on create", { customerId: noura.id, source: "phone", score: 100 }],
    ["a negative budget", { customerId: noura.id, source: "phone", budget: -1 }],
    ["a bad date", { customerId: noura.id, source: "phone", nextFollowUpAt: "soon" }],
  ] as [string, unknown][]) {
    same(`leads: ${name} is a 400`, (await post("/api/v1/leads", who.manager, body)).status, 400);
  }

  // updating
  const stageUp = await put(`/api/v1/leads/${nl.json.id}`, who.sales1, {
    stage: "contacted",
    nextFollowUpAt: null,
    budget: 350000,
  });
  ok(
    "leads: the owner of a lead moves it along",
    stageUp.status === 200 &&
      stageUp.json.stage === "contacted" &&
      stageUp.json.nextFollowUpAt === null &&
      stageUp.json.budget === 350000,
    stageUp.raw.slice(0, 300)
  );
  const stageAudit = await db.auditLog.findFirst({
    where: { organizationId: ORG, action: "lead.updated", entityId: nl.json.id },
  });
  ok(
    "leads: the stage change is audited",
    !!stageAudit && (stageAudit.metadata as { stage?: string }).stage === "contacted"
  );
  same(
    "leads: a salesperson cannot reassign to a colleague",
    (await put(`/api/v1/leads/${nl.json.id}`, who.sales1, { assignedToId: nooraId })).status,
    403
  );
  const re = await put(`/api/v1/leads/${nl.json.id}`, who.manager, { assignedToId: nooraId });
  ok("leads: a manager reassigns", re.status === 200 && re.json.assignedTo.id === nooraId);
  same(
    "leads: after that the previous owner no longer sees it",
    (await get(`/api/v1/leads/${nl.json.id}`, who.sales1)).status,
    404
  );
  same("leads: the new owner does", (await get(`/api/v1/leads/${nl.json.id}`, who.sales2)).status, 200);
  same(
    "leads: an unknown assignee is a 404",
    (await put(`/api/v1/leads/${nl.json.id}`, who.manager, { assignedToId: "nope" })).status,
    404
  );
  same(
    "leads: an unknown vehicle is a 404",
    (await put(`/api/v1/leads/${nl.json.id}`, who.manager, { interestedVehicleId: "nope" })).status,
    404
  );
  same(
    "leads: the vehicle can be cleared",
    (await put(`/api/v1/leads/${nl.json.id}`, who.manager, { interestedVehicleId: null })).json.interestedVehicle,
    null
  );
  same("leads: an empty update is a 400", (await put(`/api/v1/leads/${nl.json.id}`, who.manager, {})).status, 400);
  same(
    "leads: a bad stage is a 400",
    (await put(`/api/v1/leads/${nl.json.id}`, who.manager, { stage: "hot" })).status,
    400
  );
  same(
    "leads: a score cannot be set by the client",
    (await put(`/api/v1/leads/${nl.json.id}`, who.manager, { score: 100 })).status,
    400
  );
  same(
    "leads: a viewer cannot update",
    (await put(`/api/v1/leads/${nl.json.id}`, who.viewer, { stage: "lost" })).status,
    403
  );

  // ═════════════════════════ isolation, both ways ═════════════════════════
  same(
    "isolation: the other organization sees only its own vehicles",
    (await get("/api/v1/vehicles?pageSize=100", noCost.cookie)).json.items.map((i: { make: string }) => i.make).sort(),
    ["A", "Aaa", "Bbb", "Own"]
  );
  same(
    "isolation: and none of the demo vehicles",
    (await get("/api/v1/vehicles?search=cruiser", noCost.cookie)).json.total,
    0
  );
  const totals = await db.vehicle.count({ where: { organizationId: ORG } });
  same("isolation: the demo organization's vehicle count only grew by what it created", totals, dbVehicles.length + 2);
  same(
    "isolation: nothing was written into the other organization by the demo users",
    await db.vehicle.count({ where: { organizationId: control.id, make: { in: ["Toyota", "Ford"] } } }),
    0
  );

  // ── cleanup: the second organization is not part of the demo ──
  await db.lead.deleteMany({ where: { organizationId: control.id } });
  await db.customer.deleteMany({ where: { organizationId: control.id } });
}

main()
  .then(() => {
    console.log(`CRM HTTP check ${failures.length ? "FAILED" : "OK"} (${passed} passed, ${failures.length} failed)`);
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
