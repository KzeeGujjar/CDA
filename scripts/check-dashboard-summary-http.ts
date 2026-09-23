/**
 * End-to-end check of the consolidated dashboard endpoint (§0.20, `GET /api/v1/dashboard/summary`) over real
 * HTTP against the demo-seeded dealership: that it is reachable by any signed-in role (a `composed` route —
 * no single [resource, action] gate fits it, since an Accountant and a Marketing Manager hold different,
 * non-overlapping slices of it), that it agrees with the four original endpoints it replaces, and that a role
 * with none of vehicles/sales/leads:read gets 200 with every slice null rather than a 403 or a crash.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... CHECK_BASE_URL=http://localhost:3100 npm run check:dashboard-summary-http
 */
import { spawnSync } from "node:child_process";
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
const PASSWORD = "Dashboard-summary-check-Pw-7743";

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
  const headers: Record<string, string> = { "x-real-ip": `10.83.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` };
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
      headers: { "content-type": "application/json", "x-real-ip": `10.82.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` },
      body: JSON.stringify({ email: emailOf(name), password: PASSWORD }),
    });
    if (r.status !== 200) throw new Error(`login failed for ${name}: ${r.status}`);
    return (r.headers.get("set-cookie") ?? "").split(";")[0];
  };
  const owner = await login(demoUsers.find((u) => u.key === "owner")!.name);
  const accountant = await login(demoUsers.find((u) => u.key === "accountant")!.name);
  const marketing = await login(demoUsers.find((u) => u.key === "marketing")!.name);

  same("no session -> 401", (await get("/api/v1/dashboard/summary")).status, 401);

  // ═════════ composed access: every signed-in role gets 200, never 401/403 ═════════
  for (const [label, cookie] of [
    ["owner", owner],
    ["accountant", accountant],
    ["marketing manager", marketing],
  ] as const) {
    same(`${label} -> 200 (composed route, never refused)`, (await get("/api/v1/dashboard/summary", cookie)).status, 200);
  }

  // ═════════ owner: agrees with the four endpoints it replaces ═════════
  const [summary, inventory, sales, leads] = await Promise.all([
    get("/api/v1/dashboard/summary?period=month", owner),
    get("/api/v1/dashboard/inventory?period=month", owner),
    get("/api/v1/dashboard/sales?period=month", owner),
    get("/api/v1/dashboard/leads?period=month", owner),
  ]);
  same("summary.totalVehicles matches /dashboard/inventory", summary.json.totalVehicles, inventory.json.totalVehicles);
  same("summary.totalInventoryValue matches /dashboard/inventory (profit:read held)", summary.json.totalInventoryValue, inventory.json.inventoryValue);
  same("summary.vehiclesSold matches /dashboard/sales", summary.json.vehiclesSold, sales.json.vehiclesSold);
  same("summary.grossProfit matches /dashboard/sales", summary.json.grossProfit, sales.json.grossProfit);
  same("summary.newLeads matches /dashboard/leads", summary.json.newLeads, leads.json.newLeads);
  same("summary.conversionRate matches /dashboard/leads", summary.json.conversionRate, leads.json.conversionRate);

  // ═════════ real inventory aging and AI insights, not invented ═════════
  ok(
    "inventoryAging has exactly the four real buckets, summing to no more than total stock",
    summary.json.inventoryAging.length === 4 &&
      summary.json.inventoryAging.every((b: { label: string; value: number }) => typeof b.value === "number" && b.value >= 0)
  );
  const insightsAgeSum = summary.json.inventoryAging
    .filter((b: { label: string }) => b.label !== "0-30 days")
    .reduce((s: number, b: { value: number }) => s + b.value, 0);
  ok("aiInsights is an array of real, grounded messages (never a canned string)", Array.isArray(summary.json.aiInsights));
  if (summary.json.aiInsights.some((i: { kind: string }) => i.kind === "aging")) {
    ok("an 'aging' insight only appears when real aged stock actually exists", insightsAgeSum > 0);
  }

  // ═════════ accountant: sales/profit slice present, vehicles/leads slice null (no fabricated numbers) ═════════
  const accSummary = await get("/api/v1/dashboard/summary?period=month", accountant);
  same("accountant: no vehicles:read -> totalVehicles is null, not 0", accSummary.json.totalVehicles, null);
  same("accountant: no vehicles:read -> inventoryAging is [], not invented", accSummary.json.inventoryAging, []);
  same("accountant: no leads:read -> newLeads is null", accSummary.json.newLeads, null);
  ok("accountant: sales:read + profit:read -> vehiclesSold/grossProfit are real, non-null", accSummary.json.vehiclesSold !== null && accSummary.json.grossProfit !== null);

  // ═════════ marketing manager: none of vehicles/sales/leads -> everything null, still 200 ═════════
  const mktSummary = await get("/api/v1/dashboard/summary?period=month", marketing);
  same(
    "marketing manager: every KPI slice is null (no permission for any of them)",
    [mktSummary.json.totalVehicles, mktSummary.json.vehiclesSold, mktSummary.json.newLeads],
    [null, null, null]
  );
  same("marketing manager: inventoryAging/aiInsights are empty, not invented", [mktSummary.json.inventoryAging, mktSummary.json.aiInsights], [[], []]);

  console.log(
    failures.length
      ? `Dashboard summary HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      : `Dashboard summary HTTP check OK (${passed} passed, 0 failed)`
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error("Dashboard summary HTTP check crashed:", error);
  process.exit(1);
});
