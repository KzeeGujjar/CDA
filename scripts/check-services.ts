/**
 * Offline check (no database, no server) of the frontend's service architecture, so it cannot quietly erode:
 *   - src/services holds one `<name>Service.ts` per domain (plus `backend.ts`, the single API client), and the
 *     services the spec names exist;
 *   - UI code (pages, components, hooks, stores, libraries) never imports mock data, server code, provider SDKs or
 *     the API client, and never calls fetch or names an /api/ address: it calls services;
 *   - services never import server code or provider SDKs, and only backend.ts talks to the network;
 *   - the scanner itself is tested on snippets that break each rule, so a rule that stopped working would fail here.
 *
 *   npm run check:services
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};
const rel = (f: string) => relative(".", f).split(sep).join("/");

/** Comments and string-free view is overkill here: imports and calls are matched on the raw text, line by line. */
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const importsOf = (text: string) => [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
const callsFetch = (text: string) => /(^|[^.\w$])fetch\s*\(|window\.fetch\s*\(|globalThis\.fetch\s*\(/.test(text);
const namesApi = (text: string) => /["'`]\/api\//.test(text);

const SERVER_ONLY = [
  /^@\/server(\/|$)/,
  /^@\/generated(\/|$)/,
  /^@supabase\//,
  /^openai$/,
  /^@anthropic-ai\//,
  /^@google\/(genai|generative-ai)$/,
  /^@prisma\//,
  /^pg$/,
];

function uiViolations(text: string): string[] {
  const code = stripComments(text);
  const found: string[] = [];
  for (const spec of importsOf(code)) {
    if (SERVER_ONLY.some((p) => p.test(spec))) found.push(`imports ${spec}`);
    if (/^@\/mock(\/|$)/.test(spec)) found.push(`imports mock data ${spec}`);
    if (spec === "@/services/backend") found.push("imports the API client directly");
  }
  if (callsFetch(code)) found.push("calls fetch");
  if (namesApi(code)) found.push("names an /api/ address");
  return found;
}

function serviceViolations(text: string, file: string): string[] {
  const code = stripComments(text);
  const found: string[] = [];
  for (const spec of importsOf(code)) if (SERVER_ONLY.some((p) => p.test(spec))) found.push(`imports ${spec}`);
  if (file !== "src/services/backend.ts" && (callsFetch(code) || namesApi(code)))
    found.push("talks to the network itself");
  return found;
}

// ── the scanner detects each kind of violation ───────────────────────────────────────────────────
ok("scanner: mock import", uiViolations(`import { vehiclesFixture } from "@/mock/vehicles";`).length === 1);
ok("scanner: server import", uiViolations(`import { withTenant } from "@/server/db/tenant";`).length === 1);
ok("scanner: prisma client", uiViolations(`import { PrismaClient } from "@prisma/client";`).length === 1);
ok("scanner: supabase", uiViolations(`import { createClient } from "@supabase/supabase-js";`).length === 1);
ok("scanner: API client", uiViolations(`import { backendRequest } from "@/services/backend";`).length === 1);
ok("scanner: fetch", uiViolations(`const r = await fetch("/x");`).length === 1);
ok("scanner: window.fetch", uiViolations(`await window.fetch(u);`).length === 1);
ok("scanner: /api/ address", uiViolations("const u = `/api/v1/vehicles`;").length === 1);
ok("scanner: dynamic import", uiViolations(`const m = await import("@/mock/tasks");`).length === 1);
ok(
  "scanner: a service import is fine",
  uiViolations(`import { getVehicles } from "@/services/vehicleService";`).length === 0
);
ok(
  "scanner: refetch / prefetch are not fetch",
  uiViolations(`refetch(); prefetch(x); queryClient.fetchQuery(y);`).length === 0
);
ok(
  "scanner: a comment is not a violation",
  uiViolations(`// we used to call fetch("/api/v1/x") here\n/* import x from "@/mock/y" */`).length === 0
);
ok(
  "scanner: a service may not call fetch outside backend.ts",
  serviceViolations(`fetch("/x")`, "src/services/vehicleService.ts").length === 1
);
ok("scanner: backend.ts may", serviceViolations("fetch(`/api/v1${p}`)", "src/services/backend.ts").length === 0);
ok(
  "scanner: a service may not import the server",
  serviceViolations(`import x from "@/server/y";`, "src/services/leadService.ts").length === 1
);

// ── the real code ────────────────────────────────────────────────────────────────────────────────
const services = readdirSync("src/services").filter((f) => f.endsWith(".ts"));
const domain = services.filter((f) => f !== "backend.ts");
ok("src/services has the API client, backend.ts", services.includes("backend.ts"));
ok(
  "every other service is named <name>Service.ts",
  domain.every((f) => /^[a-z][A-Za-z0-9]*Service\.ts$/.test(f)),
  domain.filter((f) => !/^[a-z][A-Za-z0-9]*Service\.ts$/.test(f)).join(", ")
);
for (const required of ["vehicle", "customer", "lead", "deal", "task", "dashboard", "ai"]) {
  ok(`${required}Service.ts exists`, domain.includes(`${required}Service.ts`));
}
ok("no service is left unnamed by the convention (sanity: more than 20 services)", domain.length > 20);

const uiFiles = [
  ...walk("src/components"),
  ...walk("src/hooks"),
  ...walk("src/lib"),
  ...(statSync("src/store", { throwIfNoEntry: false })?.isDirectory() ? walk("src/store") : []),
  ...walk("src/app").filter((f) => !rel(f).startsWith("src/app/api/")),
];
const ui: string[] = [];
for (const f of uiFiles) for (const v of uiViolations(readFileSync(f, "utf8"))) ui.push(`${rel(f)} ${v}`);
ok(
  `UI code (${uiFiles.length} files) only reaches data through services`,
  ui.length === 0,
  `\n     ${ui.join("\n     ")}`
);

const svc: string[] = [];
for (const f of walk("src/services"))
  for (const v of serviceViolations(readFileSync(f, "utf8"), rel(f))) svc.push(`${rel(f)} ${v}`);
ok(
  `services (${services.length} files) are server-free and only backend.ts uses the network`,
  svc.length === 0,
  `\n     ${svc.join("\n     ")}`
);

// Which services are connected to the backend today (they import the API client) is written down, so a change is deliberate.
const connected = domain
  .filter((f) => /from "@\/services\/backend"/.test(readFileSync(join("src/services", f), "utf8")))
  .sort();
const EXPECTED_CONNECTED = [
  "aiService.ts",
  "authService.ts",
  "customerService.ts",
  "dashboardService.ts",
  "documentService.ts",
  "leadService.ts",
  "marketingService.ts",
  "messageService.ts",
  "notificationService.ts",
  "reportService.ts",
  "searchService.ts",
  "taskService.ts",
  "vehicleService.ts",
];
ok(
  "connected to the backend: " + EXPECTED_CONNECTED.join(", "),
  JSON.stringify(connected) === JSON.stringify(EXPECTED_CONNECTED),
  `got ${connected.join(", ")} (update EXPECTED_CONNECTED and docs §0.12 when a service is connected)`
);

if (failures.length) {
  console.error(`\nServices check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(
  `Services check OK: ${passed} assertions passed (${domain.length} services, ${connected.length} connected).`
);
