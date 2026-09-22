/**
 * Runs the REAL frontend service code (src/services/vehicleService.ts, customerService.ts, leadService.ts,
 * backend.ts) against the running app, with a fetch that behaves like a browser (relative URLs, cookie jar).
 * Unlike check-crm-http.ts (raw HTTP against the API), this exercises the TypeScript mapping these services do:
 * DTO -> the frontend's Vehicle/Customer/Lead shapes, the demo/live switch, and assignedToName -> assignedToId
 * resolution for leads.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:crm-frontend
 */
import { spawnSync } from "node:child_process";
import { createPrismaClient } from "@/server/db/client";
import { DEMO_ORGANIZATION_ID } from "../prisma/demo/data";
import { vehiclesFixture } from "@/mock/vehicles";
import { customersFixture } from "@/mock/customers";
import { leadsFixture } from "@/mock/leads";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1")
  throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (seeds the demo dealership).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
if (!/127\.0\.0\.1|localhost/.test(ownerUrl)) throw new Error("Refusing to run against a non-local database.");

const base = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const ORG = DEMO_ORGANIZATION_ID;
const PASSWORD = "Crm-frontend-Pw-2603-vt";
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
): Promise<{ message?: string; status?: number; code?: string; fieldErrors?: unknown[] } | null> =>
  fn().then(
    () => null,
    (e) => e
  );

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

  const { login, logout } = await import("@/services/authService");
  const { backendMode, resetBackendMode } = await import("@/services/backend");
  const { getVehicles, getVehiclesPaginated, getVehicleById, getVehicleMakes, createVehicle, updateVehicle } =
    await import("@/services/vehicleService");
  const { getCustomers, getCustomerById } = await import("@/services/customerService");
  const { getLeads, getLeadById, getLeadsByCustomerId, createLead, updateLeadStage, addLeadInteraction } =
    await import("@/services/leadService");

  const emailOf = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@desertfalcon-demo.example`;

  // ───────────── 1. no session: the demo data, exactly as before ─────────────
  resetBackendMode();
  ok("no session: demo mode", (await backendMode()) === "demo");
  same("...demo vehicles", await getVehicles(), vehiclesFixture);
  same("...demo customers", await getCustomers(), customersFixture);
  same("...demo leads (dates aside)", (await getLeads()).length, leadsFixture.length);
  ok(
    "...demo getVehicleById finds a fixture vehicle",
    (await getVehicleById(vehiclesFixture[0].id))?.make === vehiclesFixture[0].make
  );
  ok(
    "...an unknown live-shaped id is just not found (no crash)",
    (await getVehicleById("01ABCDEF0123456789ABCDEFGH")) === null
  );

  // ───────────── 2. facts from the database ─────────────
  const dbVehicles = await db.vehicle.findMany({ where: { organizationId: ORG } });
  const dbCustomers = await db.customer.findMany({ where: { organizationId: ORG } });
  const dbLeads = await db.lead.findMany({ where: { organizationId: ORG } });
  const lc = dbVehicles.find((v) => v.make === "Toyota" && v.model === "Land Cruiser")!;
  const f150 = dbVehicles.find((v) => v.make === "Ford")!;
  const aisha = dbCustomers.find((c) => c.name.startsWith("Aisha"))!;

  // ───────────── 3. signed in as the owner: live mode, real data ─────────────
  await login({ email: emailOf("Saeed Al Marri"), password: PASSWORD });
  ok("signed in: live mode", (await backendMode()) === "live");

  const liveVehicles = await getVehicles();
  same("live: getVehicles returns every vehicle (paged through)", liveVehicles.length, dbVehicles.length);
  const lcFull = liveVehicles.find((v) => v.id === lc.id)!;
  ok(
    "live: a vehicle maps make/model/year/price/currency correctly",
    lcFull.make === "Toyota" &&
      lcFull.model === "Land Cruiser" &&
      lcFull.price.amount === Number(lc.listPrice) &&
      lcFull.price.currency === "AED"
  );
  ok(
    "live: nested spec comes through",
    lcFull.spec.engine === "3.5L V6 Twin-Turbo" && lcFull.spec.horsepower === 409 && lcFull.spec.vin === lc.vin
  );
  ok("live: the owner sees costs", lcFull.costPrice?.amount === Number(lc.purchasePrice));
  ok(
    "live: images default to [] (no photos uploaded, no crash)",
    Array.isArray(lcFull.images) && lcFull.images.length === 0
  );
  ok(
    "live: emirate and importSpec are present when recorded",
    lcFull.emirate === "dubai" && lcFull.spec.importSpec === "GCC"
  );
  // The API spells this lower-case ("imported"); the frontend type and its translation keys use "Imported"
  // (inventory.importSpecs.Imported) — a blind toUpperCase() would produce "IMPORTED" and silently mistranslate.
  const f150Full = liveVehicles.find((v) => v.id === f150.id)!;
  same(
    "live: importSpec 'imported' maps to the frontend's 'Imported', not 'IMPORTED'",
    f150Full.spec.importSpec,
    "Imported"
  );

  const paged = await getVehiclesPaginated({ pageSize: 5, page: 1 });
  same("live: getVehiclesPaginated respects pageSize", paged.items.length, 5);
  same("live: ...and reports the true total", paged.total, dbVehicles.length);
  const byMake = await getVehiclesPaginated({ make: "Toyota", pageSize: 100 });
  same("live: filters reach the API", byMake.total, dbVehicles.filter((v) => v.make === "Toyota").length);

  const makes = await getVehicleMakes();
  same("live: getVehicleMakes is sorted and distinct", makes, [...new Set(dbVehicles.map((v) => v.make))].sort());

  const single = await getVehicleById(lc.id);
  same("live: getVehicleById matches the list version", single, lcFull);
  same(
    "live: an id from another organization's shape is just null",
    await getVehicleById("01ZZZZZZZZZZZZZZZZZZZZZZZZ"),
    null
  );

  // creating and updating through the real service functions (mirrors what the create-vehicle form sends: every
  // VehicleInput field, since the form itself requires all of them — the API's own optionality is check-crm-http's job)
  // Drop the fields VehicleInput doesn't take (id, daysInStock, acquiredAt), keeping the rest as a real VehicleInput.
  const { id: lcId, daysInStock: lcDays, acquiredAt: lcAcquired, ...lcAsInput } = lcFull;
  void lcId;
  void lcDays;
  void lcAcquired;
  const testVin = `JTMFE${Date.now().toString(36).toUpperCase().padEnd(11, "0").slice(0, 11)}`;
  const created = await createVehicle({
    ...lcAsInput,
    stockNumber: `STK-FE-${Date.now().toString(36)}`,
    make: "Toyota",
    model: "Corolla",
    trim: "SE",
    year: 2025,
    spec: { ...lcAsInput.spec, vin: testVin },
    price: { amount: 90000, currency: "AED" },
  });
  ok(
    "live: createVehicle round-trips through the API",
    created.make === "Toyota" && created.model === "Corolla" && created.stockNumber.startsWith("STK-FE-")
  );
  const updated = await updateVehicle(created.id, { notes: "Updated via the frontend service" });
  same("live: updateVehicle applies a partial patch", updated.notes, "Updated via the frontend service");
  ok("live: updateVehicle left other fields alone", updated.model === "Corolla");
  const reSpecced = await updateVehicle(created.id, { spec: { ...created.spec, importSpec: "Imported" } });
  same(
    "live: updateVehicle sends 'Imported' as the API's 'imported' and reads it back the same way",
    reSpecced.spec.importSpec,
    "Imported"
  );

  const liveCustomers = await getCustomers();
  same("live: getCustomers returns every customer", liveCustomers.length, dbCustomers.length);
  const aishaFull = liveCustomers.find((c) => c.id === aisha.id)!;
  ok(
    "live: lifetimeValue is a real, positive number for the owner",
    typeof aishaFull.lifetimeValue === "number" && aishaFull.lifetimeValue > 0
  );
  same("live: getCustomerById matches", (await getCustomerById(aisha.id))?.lifetimeValue, aishaFull.lifetimeValue);
  same("live: customers search reaches the API", (await getCustomers({ search: "kaabi" })).length, 1);

  const liveLeads = await getLeads();
  same("live: getLeads returns every lead the owner may see", liveLeads.length, dbLeads.length);
  const byCustomer = await getLeadsByCustomerId(aisha.id);
  ok(
    "live: getLeadsByCustomerId matches the database",
    byCustomer.length === dbLeads.filter((l) => l.customerId === aisha.id).length &&
      byCustomer.every((l) => l.customerId === aisha.id)
  );
  const searchByStage = await getLeads({ stage: "won" });
  same("live: stage filter reaches the API", searchByStage.length, dbLeads.filter((l) => l.stage === "WON").length);

  // createLead resolves assignedToName -> assignedToId against the real /users list
  const newLead = await createLead({
    customerId: aisha.id,
    source: "phone",
    assignedToName: "Yousef Karim",
    interestedVehicleId: f150.id,
    budget: { amount: 200000, currency: "AED" },
  });
  ok("live: createLead resolves the salesperson's name to a real user", newLead.assignedToName === "Yousef Karim");
  same("live: the new lead starts new, scored 30", [newLead.stage, newLead.score], ["new", 30]);
  ok("live: the vehicle label came through", !!newLead.interestedVehicleLabel?.includes("F-150"));
  const noSuchPerson = await fails(() =>
    createLead({ customerId: aisha.id, source: "phone", assignedToName: "Nobody Real" })
  );
  ok(
    "live: an unknown salesperson name is a clear validation error, not a crash",
    noSuchPerson?.status === 400 && !!noSuchPerson.fieldErrors
  );

  const moved = await updateLeadStage(newLead.id, "contacted");
  same("live: updateLeadStage persists through the API", moved.stage, "contacted");
  const dbAfterMove = await db.lead.findUniqueOrThrow({ where: { id: newLead.id } });
  same("live: ...and the database agrees", dbAfterMove.stage, "CONTACTED");

  // the interaction log: not persisted anywhere, but still usable for a live lead (no crash, no data loss this tab)
  const withNote = await addLeadInteraction(newLead.id, {
    type: "note",
    summary: "Called about financing.",
    authorName: "Yousef Karim",
  });
  ok(
    "live: addLeadInteraction works for a live lead",
    withNote.interactions.length === 1 && withNote.interactions[0].summary === "Called about financing."
  );
  const reread = await getLeadById(newLead.id);
  ok("live: the session-only interaction survives a re-read", reread?.interactions.length === 1);
  same(
    "live: ...but never reached the database",
    await db.auditLog.count({ where: { organizationId: ORG, action: { contains: "interaction" } } }),
    0
  );

  // ───────────── 4. a role without leads:read/create still works for what it can do ─────────────
  await logout();
  resetBackendMode();
  await login({ email: emailOf("Tariq Al Suwaidi"), password: PASSWORD }); // viewer
  const viewerLeads = await fails(() => getLeads());
  ok(
    "live: the viewer's forbidden read throws a real 403, not a silent empty list",
    (viewerLeads as { status?: number } | null)?.status === 403
  );
  const viewerVehicles = await getVehicles();
  ok(
    "live: the viewer can still read vehicles, with costs hidden",
    viewerVehicles.length > 0 && viewerVehicles.every((v) => v.costPrice === undefined)
  );

  // ───────────── 5. signing out returns to demo mode ─────────────
  await logout();
  resetBackendMode();
  ok("signed out: demo mode again", (await backendMode()) === "demo");
  same("...demo vehicles are back", await getVehicles(), vehiclesFixture);

  // ───────────── 6. an unreachable backend falls back to demo, not an error ─────────────
  resetBackendMode();
  const realBase = base;
  (globalThis as unknown as { __base: string }).__base = realBase;
  const brokenFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  ok("unreachable backend: demo mode", (await backendMode()) === "demo");
  same("...demo vehicles, not a thrown error", await getVehicles(), vehiclesFixture);
  globalThis.fetch = brokenFetch;
  resetBackendMode();

  // cleanup: only the vehicle this run created outside the seed's own set
  await db.vehicle.delete({ where: { id: created.id } }).catch(() => undefined);
}

main()
  .then(async () => {
    console.log(
      `CRM frontend-service check ${failures.length ? "FAILED" : "OK"} (${passed} passed, ${failures.length} failed)`
    );
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
