/**
 * Server-side and end-to-end check of failure handling, against a real PostgreSQL and the built app:
 *   A. real database failures (unique, foreign key, check, trigger, too long, missing row, bad enum, connection
 *      refused) are turned into safe, classified answers that never contain host, SQL or constraint names;
 *   B. the HTTP error matrix on real endpoints: 400 with field errors, 401, 403, 404, 429 (with Retry-After), bad JSON;
 *      every error body has the same small shape and a request id;
 *   C. an app whose DATABASE IS DOWN answers 503 database_unavailable (Retry-After), and the frontend services then
 *      show a real error, never demo data or a demo sign-in;
 *   D. an app with NO BACKEND CONFIGURED answers 503 backend_not_configured, and the frontend falls back to demo data.
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:errors-http
 *   (app on :3100 already running and built; this script starts two more instances on :3101 and :3102)
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createPrismaClient } from "@/server/db/client";
import { mapDatabaseError } from "@/server/lib/db-errors";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { dealerPerformanceSummaryFixture } from "@/mock/analytics";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
if (!/127\.0\.0\.1|localhost/.test(ownerUrl)) throw new Error("Refusing to run against a non-local database.");
const MAIN = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const DEAD_DB = "postgresql://postgres:postgres@127.0.0.1:1/cda?sslmode=disable";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const dead = createPrismaClient(DEAD_DB, { maxConnections: 1 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
const LEAK = /127\.0\.0\.1|localhost|5432|constraint|_pkey|_fkey|_chk|_key\b|SELECT |INSERT |UPDATE |Prisma|violates/i;

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
async function call(
  base: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  rawBody?: string
): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": nextIp() };
  if (token) headers.cookie = `${sessionCookieName()}=${token}`;
  if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
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

// ── starting extra app instances ─────────────────────────────────────────────────────────────────
const children: ChildProcess[] = [];
async function startApp(port: number, env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: { ...env, PORT: String(port) },
    stdio: "ignore",
  });
  children.push(child);
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${port}/api/v1/auth/me`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`app on ${port} did not start`);
}
function stopApps() {
  for (const c of children) {
    if (!c.pid) continue;
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: "ignore" });
      else c.kill();
    } catch {
      // already gone
    }
  }
}

async function main() {
  const org = await db.organization.create({ data: { name: `Err ${suffix}`, email: `err-${suffix}@example.com` } });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const mk = async (key: string, roleId: string) => {
    const user = await db.user.create({
      data: { organizationId: org.id, roleId, name: key, email: `${key}-err-${suffix}@example.com`, status: "ACTIVE" },
    });
    return (await createSession(db, { organizationId: org.id, userId: user.id })).token;
  };
  const owner = await mk("owner", roles.dealerOwner);
  const viewer = await mk("viewer", roles.viewer);

  // ═════════ A. real database errors -> safe answers ═════════
  const v = await db.vehicle.create({
    data: { organizationId: org.id, stockNumber: `E1-${suffix}`, make: "a", model: "b", year: 2020, listPrice: 1 },
  });
  const dbCase = async (
    name: string,
    fn: () => Promise<unknown>,
    expected: { status: number; code: string } | null,
    message?: RegExp
  ) => {
    try {
      await fn();
      ok(name, false, "no error");
    } catch (e) {
      const mapped = mapDatabaseError(e);
      if (expected === null) return ok(name, mapped === null);
      ok(
        name,
        !!mapped &&
          mapped.status === expected.status &&
          mapped.code === expected.code &&
          !LEAK.test(mapped.message) &&
          (!message || message.test(mapped.message)),
        `${mapped?.status} ${mapped?.code} "${mapped?.message}"`
      );
    }
  };
  await dbCase(
    "unique violation -> 409 conflict",
    () =>
      db.vehicle.create({
        data: { organizationId: org.id, stockNumber: `E1-${suffix}`, make: "a", model: "b", year: 2020, listPrice: 1 },
      }),
    { status: 409, code: "conflict" }
  );
  await dbCase(
    "foreign key -> 409 conflict",
    () =>
      db.deal.create({
        data: { organizationId: org.id, reference: `R-${suffix}`, customerId: "nope", vehicleId: v.id, salePrice: 1 },
      }),
    { status: 409, code: "conflict" }
  );
  await dbCase(
    "unknown currency (foreign key) -> 409",
    () => db.organization.create({ data: { name: "x", email: `q-${suffix}@example.com`, currency: "QQQ" } }),
    { status: 409, code: "conflict" }
  );
  await dbCase(
    "check constraint -> 400 validation_error, no constraint name",
    () => db.vehicle.update({ where: { id: v.id }, data: { year: 1800 } }),
    { status: 400, code: "validation_error" }
  );
  await dbCase(
    "value too long -> 400",
    () => db.organization.create({ data: { name: "x", email: `w-${suffix}@example.com`, country: "GBRX" } }),
    { status: 400, code: "validation_error" }
  );
  await dbCase("invalid enum text -> 400", () => db.$executeRawUnsafe(`UPDATE vehicles SET status = 'nope'`), {
    status: 400,
    code: "validation_error",
  });
  await dbCase("missing row -> 404", () => db.vehicle.update({ where: { id: "nope" }, data: { year: 2020 } }), {
    status: 404,
    code: "not_found",
  });
  await dbCase(
    "a rule enforced by a trigger -> 409 business_rule, in its own words",
    () => db.vehicle.update({ where: { id: v.id }, data: { status: "SOLD" } }),
    { status: 409, code: "business_rule" },
    /^A vehicle becomes sold only by completing a deal\.$/
  );
  await dbCase("connection refused -> 503 database_unavailable", () => dead.organization.findFirst(), {
    status: 503,
    code: "database_unavailable",
  });
  await dbCase("connection refused (raw query) -> 503", () => dead.$queryRaw`select 1`, {
    status: 503,
    code: "database_unavailable",
  });
  const refused = await dead.organization.findFirst().catch((e) => mapDatabaseError(e));
  same(
    "...with a Retry-After of 5 seconds",
    (refused as { headers?: Record<string, string> } | null)?.headers?.["retry-after"],
    "5"
  );
  same(
    "a non-database error is not mapped (stays a generic 500)",
    [
      mapDatabaseError(new Error("boom")),
      mapDatabaseError(null),
      mapDatabaseError("x"),
      mapDatabaseError({ code: "P2002" }),
    ],
    [null, null, null, null]
  );
  await dbCase(
    "...and a database error it does not know stays unmapped",
    async () => {
      const e = new Error("x") as Error & { code: string; meta: object };
      e.name = "PrismaClientKnownRequestError";
      e.code = "P9999";
      e.meta = {};
      throw e;
    },
    null
  );

  // ═════════ B. the HTTP error matrix ═════════
  const shape = (r: Res) =>
    Object.keys(r.json ?? {}).every((k) => ["message", "code", "status", "fieldErrors", "requestId"].includes(k));
  const noSession = await call(MAIN, "GET", "/api/v1/dashboard/sales");
  same("no session -> 401 unauthorized", [noSession.status, noSession.json.code], [401, "unauthorized"]);
  const forbidden = await call(MAIN, "GET", "/api/v1/ai/agent/tools", viewer);
  same("a role without the permission -> 403 forbidden", [forbidden.status, forbidden.json.code], [403, "forbidden"]);
  const missing = await call(MAIN, "GET", "/api/v1/ai/conversations/does-not-exist", owner);
  same("a record that is not there -> 404 not_found", [missing.status, missing.json.code], [404, "not_found"]);
  const invalid = await call(MAIN, "POST", "/api/v1/tasks", owner, { title: "" });
  ok(
    "bad input -> 400 validation_error with the fields named",
    invalid.status === 400 &&
      invalid.json.code === "validation_error" &&
      invalid.json.fieldErrors?.some((f: { path: string }) => f.path === "title"),
    invalid.raw.slice(0, 200)
  );
  const badJson = await call(MAIN, "POST", "/api/v1/tasks", owner, undefined, "{not json");
  same("malformed JSON -> 400 invalid_json", [badJson.status, badJson.json.code], [400, "invalid_json"]);
  const tenant = await call(MAIN, "POST", "/api/v1/tasks", owner, { title: "x", organizationId: "someone-else" });
  same(
    "a dealership id from the client -> 400 tenant_field_not_allowed",
    [tenant.status, tenant.json.code],
    [400, "tenant_field_not_allowed"]
  );
  let limited: Res | null = null;
  const email = `rl-${suffix}@example.com`;
  for (let i = 0; i < 16 && !limited; i++) {
    const r = await call(MAIN, "POST", "/api/v1/auth/login", undefined, { email, password: "wrong-password-123" });
    if (r.status === 429) limited = r;
  }
  ok(
    "too many sign-in attempts -> 429 rate_limited with Retry-After",
    !!limited && limited.json.code === "rate_limited" && Number(limited.headers.get("retry-after")) >= 1
  );
  const all = [noSession, forbidden, missing, invalid, badJson, tenant, ...(limited ? [limited] : [])];
  ok(
    "every error body has the same small shape and a request id",
    all.every((r) => shape(r) && typeof r.json.requestId === "string" && r.json.requestId.length >= 8 && r.json.message)
  );
  ok(
    "no error body contains host, SQL or internals",
    all.every((r) => !LEAK.test(r.raw))
  );
  ok(
    "errors are never cached",
    all.every((r) => r.headers.get("cache-control") === "no-store")
  );

  // ═════════ C. database down ═════════
  const cookieName = sessionCookieName();
  await startApp(3101, { ...process.env, DATABASE_URL: DEAD_DB, DIRECT_DATABASE_URL: DEAD_DB });
  const DOWN = "http://localhost:3101";
  const login = await call(DOWN, "POST", "/api/v1/auth/login", undefined, {
    email: "a@example.com",
    password: "whatever-123",
  });
  same("DB down: sign-in -> 503 database_unavailable", [login.status, login.json.code], [503, "database_unavailable"]);
  same(
    "...with Retry-After and a request id",
    [login.headers.get("retry-after"), typeof login.json.requestId],
    ["5", "string"]
  );
  const meDown = await call(DOWN, "GET", "/api/v1/auth/me", "s".repeat(43));
  same(
    "DB down: a signed-in user's request -> 503 database_unavailable (not 500)",
    [meDown.status, meDown.json.code],
    [503, "database_unavailable"]
  );
  const meNone = await call(DOWN, "GET", "/api/v1/auth/me");
  same(
    "DB down: with no session it is still a plain 401 (no database needed)",
    [meNone.status, meNone.json.code],
    [401, "unauthorized"]
  );
  ok(
    "DB down: nothing internal in any answer",
    [login, meDown, meNone].every((r) => !LEAK.test(r.raw)),
    [login, meDown].map((r) => r.raw).join(" | ")
  );

  // the frontend services against the dead database
  const jar = new Map<string, string>();
  let base = DOWN;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" && input.startsWith("/") ? `${base}${input}` : input;
    const headers = new Headers(init?.headers);
    headers.set("x-real-ip", nextIp());
    if (jar.size) headers.set("cookie", [...jar].map(([k, val]) => `${k}=${val}`).join("; "));
    return realFetch(url, { ...init, headers });
  }) as typeof fetch;
  const { backendMode, resetBackendMode } = await import("@/services/backend");
  const { getDealerPerformanceSummary } = await import("@/services/dashboardService");
  const { login: serviceLogin } = await import("@/services/authService");
  const { classifyError } = await import("@/lib/errors/classify");
  const fails = (fn: () => Promise<unknown>) =>
    fn().then(
      () => null,
      (e) => e as { status?: number; code?: string; requestId?: string }
    );

  resetBackendMode();
  same("frontend, DB down, no session: demo mode (nothing to protect)", await backendMode(), "demo");
  jar.set(cookieName, "s".repeat(43));
  resetBackendMode();
  same("frontend, DB down, signed in: still LIVE (never quietly demo)", await backendMode(), "live");
  const dash = await fails(() => getDealerPerformanceSummary());
  ok(
    "...so the dashboard fails with a real, retryable database error",
    dash?.status === 503 &&
      dash.code === "database_unavailable" &&
      !!dash.requestId &&
      classifyError(dash).kind === "database" &&
      classifyError(dash).retryable
  );
  const signIn = await fails(() => serviceLogin({ email: "a@example.com", password: "whatever-123" }));
  ok(
    "...and sign-in fails with the same error instead of signing in as the demo user",
    signIn?.code === "database_unavailable"
  );
  jar.clear();

  // ═════════ D. no backend configured ═════════
  const bare = { ...process.env } as NodeJS.ProcessEnv;
  delete bare.DATABASE_URL;
  delete bare.DIRECT_DATABASE_URL;
  await startApp(3102, bare);
  const NONE = "http://localhost:3102";
  const cfg = await call(NONE, "POST", "/api/v1/auth/login", undefined, {
    email: "a@example.com",
    password: "whatever-123",
  });
  same(
    "no backend configured: 503 backend_not_configured",
    [cfg.status, cfg.json.code],
    [503, "backend_not_configured"]
  );
  ok(
    "...without leaking the missing setting names",
    !/DATABASE_URL|DIRECT_DATABASE_URL|environment/i.test(cfg.raw),
    cfg.raw
  );
  base = NONE;
  jar.set(cookieName, "anything");
  resetBackendMode();
  same("frontend, no backend: demo mode", await backendMode(), "demo");
  same("...demo dashboard data", await getDealerPerformanceSummary(), dealerPerformanceSummaryFixture);
  const demo = await serviceLogin({ email: "anyone@example.com", password: "anything" });
  ok("...and the demo sign-in still works", demo.token.startsWith("mock-token"));
  globalThis.fetch = realFetch;
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    stopApps();
    await db.$disconnect();
    await dead.$disconnect().catch(() => {});
    if (failures.length) {
      console.error(
        `\nErrors HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Errors HTTP check OK: ${passed} assertions passed.`);
    process.exit(0);
  });
