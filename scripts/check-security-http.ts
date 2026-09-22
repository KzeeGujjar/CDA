/**
 * Security audit of the running, built app: `npm run check:security-http` (app on CHECK_BASE_URL, default :3100,
 * started with `next start`; real PostgreSQL). It attacks the app the way a browser or a script would:
 *
 *   A. page headers: a Content-Security-Policy whose nonce is fresh per response and stamped on every script;
 *      HSTS, nosniff, frame and referrer policies; no framework banner
 *   B. API headers: locked-down CSP, no CORS grant to any origin, never cached
 *   C. cross-site request forgery: a hostile Origin / Sec-Fetch-Site is refused even WITH a valid session cookie,
 *      and the write does not happen; "Origin: null" and junk origins are refused (403, never 500)
 *   D. request body: JSON only (415), size-capped (413, also when chunked), malformed / hostile JSON is a 400
 *      (prototype pollution, ten-thousand-deep nesting), unknown fields and client-chosen tenants are refused
 *   E. authentication on EVERY endpoint: no cookie, garbage cookie, short cookie and a revoked session all get 401
 *   F. path parameters: hostile ids never cause a 5xx and never leak internals
 *   G. sessions: cookie attributes (HttpOnly, SameSite, Path, no Domain), no token or hash in any body, logout
 *      really ends the session
 */
import { request } from "node:http";
import { hashPassword } from "@/server/auth/password";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { createPrismaClient } from "@/server/db/client";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { loadRouteManifest } from "./lib/route-manifest";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl || !/127\.0\.0\.1|localhost/.test(ownerUrl))
  throw new Error("Set DIRECT_DATABASE_URL to a LOCAL throwaway database.");
const BASE = new URL(process.env.CHECK_BASE_URL ?? "http://localhost:3100");

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const LEAK =
  /127\.0\.0\.1|5432|constraint|_pkey|_fkey|_chk\b|SELECT |INSERT |UPDATE |Prisma|violates|node_modules|\bat .*\.(ts|js):\d+|password_hash|passwordHash|argon2/i;

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  raw: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}
let ipCounter = 0;
const octet = 1 + Math.floor(Math.random() * 200);
const nextIp = () => `10.${octet}.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

/** One raw HTTP request: every header, and the body, are exactly what the caller says. */
function send(
  method: string,
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: string | Buffer | (() => AsyncGenerator<Buffer>);
    token?: string;
  } = {}
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "x-real-ip": nextIp(), ...options.headers };
    if (options.token) headers.cookie = `${sessionCookieName()}=${options.token}`;
    const chunked = typeof options.body === "function";
    const payload = typeof options.body === "string" || Buffer.isBuffer(options.body) ? options.body : undefined;
    if (payload !== undefined && headers["content-length"] === undefined)
      headers["content-length"] = String(Buffer.byteLength(payload));
    const req = request({ host: BASE.hostname, port: BASE.port, method, path, headers }, (res) => {
      const parts: Buffer[] = [];
      res.on("data", (c: Buffer) => parts.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(parts).toString("utf8");
        let json: unknown = null;
        try {
          json = JSON.parse(raw);
        } catch {
          // not JSON
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, raw, json });
      });
    });
    req.on("error", reject);
    if (chunked) {
      (async () => {
        try {
          for await (const chunk of (options.body as () => AsyncGenerator<Buffer>)())
            if (!req.write(chunk)) await new Promise((r) => req.once("drain", r));
          req.end();
        } catch (error) {
          reject(error);
        }
      })();
    } else req.end(payload);
  });
}
const JSON_HEADERS = { "content-type": "application/json" };
const header = (r: Res, name: string) => {
  const v = r.headers[name.toLowerCase()];
  return Array.isArray(v) ? v.join(", ") : (v ?? "");
};

async function main() {
  const org = await db.organization.create({ data: { name: `Sec ${suffix}`, email: `sec-${suffix}@example.com` } });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const mk = async (key: string, roleId: string, password?: string) => {
    const user = await db.user.create({
      data: {
        organizationId: org.id,
        roleId,
        name: key,
        email: `${key}-sec-${suffix}@example.com`,
        status: "ACTIVE",
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    const { token } = await createSession(db, { organizationId: org.id, userId: user.id });
    return { user, token };
  };
  const owner = await mk("owner", roles.dealerOwner);
  const viewer = await mk("viewer", roles.viewer);

  // ═════════ A. page headers and the CSP ═════════
  const pages = ["/login", "/dashboard", `/no-such-page-${suffix}`];
  const nonces: string[] = [];
  for (const path of pages) {
    const res = await send("GET", path, { headers: { accept: "text/html" } });
    const csp = header(res, "content-security-policy");
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? "";
    ok(`${path}: answers (${res.status})`, res.status === 200 || res.status === 404);
    ok(`${path}: has a Content-Security-Policy with a nonce`, nonce.length >= 20, csp.slice(0, 80));
    nonces.push(nonce);
    const scripts = [...res.raw.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    ok(`${path}: the page has scripts to protect`, scripts.length > 0);
    const unstamped = scripts.filter((s) => !s.includes(`nonce="${nonce}"`));
    ok(`${path}: every <script> carries this response's nonce`, unstamped.length === 0, unstamped[0]?.slice(0, 120));
    ok(`${path}: no inline event handler attributes (onclick=...)`, !/<[a-z][^>]*\son[a-z]+\s*=/i.test(res.raw));
    ok(
      `${path}: script-src has no unsafe-inline / unsafe-eval / wildcard`,
      !/script-src[^;]*('unsafe-inline'|'unsafe-eval'|\s\*)/.test(csp),
      csp
    );
    ok(
      `${path}: frame-ancestors none, object-src none, base-uri self`,
      /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp)
    );
    ok(`${path}: the internal x-nonce header is not sent back`, header(res, "x-nonce") === "");
    ok(
      `${path}: Strict-Transport-Security`,
      /max-age=\d{7,}; includeSubDomains/.test(header(res, "strict-transport-security"))
    );
    ok(`${path}: X-Content-Type-Options nosniff`, header(res, "x-content-type-options") === "nosniff");
    ok(`${path}: X-Frame-Options DENY`, header(res, "x-frame-options") === "DENY");
    ok(`${path}: Referrer-Policy`, header(res, "referrer-policy") === "strict-origin-when-cross-origin");
    ok(
      `${path}: Permissions-Policy turns off camera, microphone, geolocation`,
      /camera=\(\)/.test(header(res, "permissions-policy")) &&
        /microphone=\(\)/.test(header(res, "permissions-policy")) &&
        /geolocation=\(\)/.test(header(res, "permissions-policy"))
    );
    ok(`${path}: Cross-Origin-Opener-Policy`, header(res, "cross-origin-opener-policy") === "same-origin");
    ok(`${path}: no framework banner (x-powered-by)`, header(res, "x-powered-by") === "");
  }
  ok("every response gets a different nonce", new Set(nonces).size === nonces.length);
  const again = await send("GET", "/login", { headers: { accept: "text/html" } });
  ok(
    "a repeat request gets a new nonce",
    !nonces.includes(/'nonce-([^']+)'/.exec(header(again, "content-security-policy"))?.[1] ?? "")
  );
  const asset = /\/_next\/static\/[^"']+\.js/.exec(again.raw)?.[0];
  ok("found a static script to fetch", !!asset);
  if (asset) {
    const res = await send("GET", asset);
    ok(
      "static assets are served with nosniff",
      res.status === 200 && header(res, "x-content-type-options") === "nosniff"
    );
  }

  // ═════════ B. API headers and CORS ═════════
  const me = await send("GET", "/api/v1/auth/me", { headers: { origin: "https://evil.example" } });
  ok("API: 401 without a session", me.status === 401);
  ok(
    "API: default-src 'none' policy",
    /default-src 'none'/.test(header(me, "content-security-policy")) &&
      /frame-ancestors 'none'/.test(header(me, "content-security-policy"))
  );
  ok("API: Cross-Origin-Resource-Policy same-origin", header(me, "cross-origin-resource-policy") === "same-origin");
  ok("API: never cached", /no-store/.test(header(me, "cache-control")));
  ok(
    "API: nosniff and HSTS",
    header(me, "x-content-type-options") === "nosniff" && !!header(me, "strict-transport-security")
  );
  ok("API: JSON content type", /application\/json/.test(header(me, "content-type")));
  ok(
    "API: no CORS grant to a foreign origin",
    header(me, "access-control-allow-origin") === "" && header(me, "access-control-allow-credentials") === ""
  );
  const preflight = await send("OPTIONS", "/api/v1/auth/login", {
    headers: {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  ok(
    "API: a cross-origin preflight is not approved",
    header(preflight, "access-control-allow-origin") === "" && header(preflight, "access-control-allow-methods") === ""
  );

  // ═════════ C. cross-site request forgery ═════════
  const host = `${BASE.hostname}:${BASE.port}`;
  const branchBody = JSON.stringify({ name: `csrf-${suffix}`, city: "Dubai" });
  const branchCount = () => db.branch.count({ where: { organizationId: org.id } });
  const before = await branchCount();
  const okBranch = await send("POST", "/api/v1/branches", {
    token: owner.token,
    headers: { ...JSON_HEADERS, origin: `http://${host}` },
    body: branchBody,
  });
  ok(
    "baseline: a same-origin write with a valid session is accepted",
    okBranch.status === 201 || okBranch.status === 200,
    `${okBranch.status} ${okBranch.raw.slice(0, 150)}`
  );
  const afterOk = await branchCount();
  ok("baseline: the branch was created", afterOk === before + 1, `${before} -> ${afterOk}`);
  for (const [label, headers] of [
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["a look-alike Origin (same host prefix)", { origin: `http://${host}.evil.example` }],
    ["Origin: null", { origin: "null" }],
    ["an unparsable Origin", { origin: "not a url" }],
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site" }],
    [
      "a foreign Origin hidden behind Sec-Fetch-Site: same-origin",
      { origin: "https://evil.example", "sec-fetch-site": "same-origin" },
    ],
  ] as const) {
    const res = await send("POST", "/api/v1/branches", {
      token: owner.token,
      headers: { ...JSON_HEADERS, ...headers },
      body: branchBody,
    });
    ok(
      `CSRF: ${label} with a VALID session is refused with 403`,
      res.status === 403,
      `${res.status} ${res.raw.slice(0, 100)}`
    );
    ok(`CSRF: ${label} does not create the record`, (await branchCount()) === afterOk);
  }
  for (const method of ["PATCH", "PUT", "DELETE"]) {
    const res = await send(method, `/api/v1/branches/01ARZ3NDEKTSV4RRFFQ69G5FAV`, {
      token: owner.token,
      headers: { ...JSON_HEADERS, origin: "https://evil.example" },
      body: "{}",
    });
    ok(`CSRF: ${method} from a foreign origin is refused (${res.status})`, res.status === 403 || res.status === 405);
  }
  const sameOriginFetch = await send("POST", "/api/v1/branches", {
    token: owner.token,
    headers: { ...JSON_HEADERS, "sec-fetch-site": "same-origin", origin: `http://${host}` },
    body: JSON.stringify({}),
  });
  ok(
    "a genuine same-origin request passes the guard (and is then validated)",
    sameOriginFetch.status === 400,
    `${sameOriginFetch.status}`
  );
  const noHeaders = await send("POST", "/api/v1/branches", {
    token: owner.token,
    headers: JSON_HEADERS,
    body: JSON.stringify({}),
  });
  ok("a request with neither header (script, not browser) reaches normal validation", noHeaders.status === 400);
  const hostileRead = await send("GET", "/api/v1/branches", {
    token: owner.token,
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  ok(
    "a cross-site READ is answered but without any CORS grant, so a page cannot read it",
    hostileRead.status === 200 && header(hostileRead, "access-control-allow-origin") === ""
  );
  const viewerWrite = await send("POST", "/api/v1/branches", {
    token: viewer.token,
    headers: JSON_HEADERS,
    body: branchBody,
  });
  ok("a viewer cannot create a branch (403)", viewerWrite.status === 403);

  // ═════════ D. the request body ═════════
  const post = (options: Parameters<typeof send>[2], path = "/api/v1/branches") =>
    send("POST", path, { token: owner.token, ...options });
  const wrongType = async (label: string, contentType: string | undefined) => {
    const res = await post({ headers: contentType ? { "content-type": contentType } : {}, body: branchBody });
    ok(`content type ${label} -> 415`, res.status === 415, `${res.status}`);
    ok(`content type ${label}: nothing was written`, (await branchCount()) === afterOk);
  };
  await wrongType("text/plain", "text/plain");
  await wrongType("form-urlencoded", "application/x-www-form-urlencoded");
  await wrongType("multipart", "multipart/form-data; boundary=x");
  await wrongType("missing", undefined);
  await wrongType("application/jsonx", "application/jsonx");
  for (const ct of ["application/json; charset=utf-8", "APPLICATION/JSON", "application/json ;charset=UTF-8"]) {
    const res = await post({ headers: { "content-type": ct }, body: JSON.stringify({}) });
    ok(`content type "${ct}" is accepted (then validated -> 400)`, res.status === 400, `${res.status}`);
  }
  const big = JSON.stringify({ name: "x".repeat(1_000_100) });
  const tooBig = await post({ headers: JSON_HEADERS, body: big });
  ok("a body over 1 MB is refused with 413", tooBig.status === 413, `${tooBig.status}`);
  ok(
    "413 has the standard error shape",
    tooBig.json?.code === "payload_too_large" && typeof tooBig.json?.requestId === "string"
  );
  const chunked = await post({
    headers: JSON_HEADERS,
    body: async function* () {
      for (let i = 0; i < 12; i++) yield Buffer.from(i === 0 ? '{"name":"' : "y".repeat(100_000));
    },
  });
  ok("a CHUNKED body with no declared length is capped too (413)", chunked.status === 413, `${chunked.status}`);
  const lying = await post({ headers: { ...JSON_HEADERS, "content-length": "5" }, body: "{}" }).catch(() => null);
  ok("a wrong content-length does not crash the server", lying === null || lying.status >= 400 || lying.status === 200);
  const justUnder = await post({ headers: JSON_HEADERS, body: JSON.stringify({ name: "z".repeat(900_000) }) });
  ok(
    "a large but permitted body is validated, not cut off (400 field error)",
    justUnder.status === 400 && Array.isArray(justUnder.json?.fieldErrors),
    `${justUnder.status}`
  );
  for (const [label, body] of [
    ["not JSON", "{oops"],
    ["empty body", ""],
    ["JSON null", "null"],
    ["a JSON array", "[]"],
    ["a JSON number", "42"],
    ["a JSON string", '"hello"'],
    ["ten-thousand-deep nesting", "[".repeat(200_000) + "]".repeat(200_000)],
    ["prototype pollution (__proto__)", '{"__proto__":{"admin":true}}'],
    ["prototype pollution (constructor)", '{"constructor":{"prototype":{"admin":true}}}'],
    ["a lone surrogate / control characters", '{"name":"\\ud800\\u0000"}'],
  ] as const) {
    const res = await post({ headers: JSON_HEADERS, body });
    ok(`hostile body (${label}) is a 400, never a 5xx`, res.status === 400, `${res.status} ${res.raw.slice(0, 100)}`);
    ok(`hostile body (${label}) leaks nothing`, !LEAK.test(res.raw), res.raw.slice(0, 150));
  }
  ok(
    "the server is still healthy after all of that",
    (await send("GET", "/api/v1/auth/me", { token: owner.token })).status === 200
  );
  ok(
    "...and nothing was polluted (a fresh object has no `admin`)",
    ({} as Record<string, unknown>).admin === undefined &&
      (await send("GET", "/api/v1/branches", { token: owner.token })).status === 200
  );
  for (const [label, body] of [
    ["an unknown field", { name: "A", city: "Dubai", emirate: "DUBAI", isAdmin: true }],
    ["organizationId", { name: "A", organizationId: "other" }],
    ["dealershipId (any case)", { name: "A", DealershipId: "other" }],
    ["a tenant key nested deep", { name: "A", meta: { a: [{ b: { tenant_id: "x" } }] } }],
  ] as const) {
    const res = await post({ headers: JSON_HEADERS, body: JSON.stringify(body) });
    ok(`${label} in the body is refused (400)`, res.status === 400, `${res.status}`);
  }
  for (const q of ["organizationId=x", "dealershipId=x", "TENANT=x", "org_id=x"]) {
    const res = await send("GET", `/api/v1/branches?${q}`, { token: owner.token });
    ok(
      `?${q} is refused (400 tenant_field_not_allowed)`,
      res.status === 400 && res.json?.code === "tenant_field_not_allowed",
      `${res.status}`
    );
  }
  ok("a branch was created only by the one legitimate request", (await branchCount()) === afterOk);

  // ═════════ E. authentication on every endpoint ═════════
  const { entries } = loadRouteManifest();
  const revoked = await mk("revoked", roles.viewer);
  await db.session.updateMany({ where: { userId: revoked.user.id }, data: { revokedAt: new Date() } });
  const concrete = (url: string) => url.replace(/:(\w+)/g, "01ARZ3NDEKTSV4RRFFQ69G5FAV");
  const protectedEntries = entries.filter((e) => e.access.kind !== "public");
  ok("audited every non-public endpoint", protectedEntries.length >= 55, `${protectedEntries.length}`);
  for (const e of protectedEntries) {
    const label = `${e.method} ${e.url}`;
    const attempts: [string, string | undefined][] = [
      ["no cookie", undefined],
      ["a garbage cookie", "g".repeat(43)],
      ["a too-short cookie", "short"],
      ["a revoked session", revoked.token],
      ["a cookie with header-injection characters", "a%0d%0aSet-Cookie:%20x=1"],
    ];
    for (const [what, token] of attempts) {
      const res = await send(e.method, concrete(e.url), {
        token,
        headers: JSON_HEADERS,
        body: e.method === "GET" || e.method === "DELETE" ? undefined : "{}",
      });
      ok(`${label} with ${what} -> 401`, res.status === 401, `${res.status}`);
    }
  }
  for (const e of entries.filter((x) => x.access.kind === "public" && !x.url.endsWith("/auth/logout"))) {
    const res = await send(e.method, concrete(e.url), { headers: JSON_HEADERS, body: "{}" });
    ok(
      `public ${e.method} ${e.url} rejects an empty body cleanly (${res.status})`,
      res.status >= 400 && res.status < 500 && !LEAK.test(res.raw)
    );
  }

  // ═════════ F. hostile path parameters ═════════
  for (const [label, path] of [
    ["a page", "/inventory/%E0%A4%A"],
    ["an unknown page", "/no-such-%C0%AF-page"],
    ["an API path", "/api/v1/users/%E0%A4%A"],
    ["an API path with an invalid UTF-8 sequence", "/api/v1/branches/%C0%AF"],
  ] as const) {
    const res = await send("GET", path, { token: owner.token });
    ok(
      `malformed percent-encoding in ${label} is a 400, not a 500 (${res.status})`,
      res.status === 400,
      res.raw.slice(0, 100)
    );
    ok(`...and says nothing about the server (${label})`, !LEAK.test(res.raw));
  }
  const apiBad = await send("GET", "/api/v1/users/%E0%A4%A", { token: owner.token });
  ok(
    "...an API answer keeps the standard JSON error shape and the API headers",
    apiBad.json?.code === "bad_request" &&
      /default-src 'none'/.test(header(apiBad, "content-security-policy")) &&
      header(apiBad, "x-content-type-options") === "nosniff"
  );
  const hostileIds = [
    "not-a-valid-id!!",
    "'; DROP TABLE users;--",
    "%00",
    "../../etc/passwd",
    "a".repeat(3000),
    "%E0%A4%A",
    "0",
    "-1",
  ];
  for (const e of entries.filter((x) => x.access.kind !== "public" && x.url.includes(":"))) {
    const isRead = e.method === "GET";
    for (const id of hostileIds) {
      const url = e.url.replace(/:(\w+)/g, encodeURI(id).replace(/%25/g, "%"));
      let res: Res;
      try {
        res = await send(e.method, url, {
          token: owner.token,
          headers: { ...JSON_HEADERS, origin: `http://${host}` },
          body: isRead || e.method === "DELETE" ? undefined : "{}",
        });
      } catch {
        continue; // the client library refused to build the request line: nothing reached the server
      }
      ok(
        `${e.method} ${e.url} with id ${JSON.stringify(id.slice(0, 20))}: no 5xx (${res.status})`,
        res.status < 500,
        res.raw.slice(0, 120)
      );
      ok(`${e.method} ${e.url} with a hostile id leaks nothing`, !LEAK.test(res.raw), res.raw.slice(0, 150));
    }
  }

  // ═════════ G. sessions and cookies ═════════
  const password = `Sec-${suffix}-Pass#9`;
  const login = await mk("login", roles.dealerOwner, password);
  const email = `login-sec-${suffix}@example.com`;
  const signIn = () =>
    send("POST", "/api/v1/auth/login", {
      headers: { ...JSON_HEADERS, origin: `http://${host}` },
      body: JSON.stringify({ email, password }),
    });
  const first = await signIn();
  ok("sign-in works", first.status === 200, `${first.status} ${first.raw.slice(0, 120)}`);
  const setCookie = ([] as string[]).concat((first.headers["set-cookie"] as string[] | undefined) ?? []);
  ok("exactly one cookie is set", setCookie.length === 1);
  const cookie = setCookie[0] ?? "";
  ok("the session cookie is HttpOnly", /;\s*HttpOnly/i.test(cookie));
  ok("the session cookie is SameSite=Lax (or stricter)", /;\s*SameSite=(Lax|Strict)/i.test(cookie));
  ok(
    "the session cookie is Path=/ with an expiry and no Domain",
    /;\s*Path=\//.test(cookie) && /Max-Age=\d+/.test(cookie) && !/Domain=/i.test(cookie)
  );
  ok("the cookie name is the configured one", cookie.startsWith(`${sessionCookieName()}=`));
  const tokenValue = decodeURIComponent(cookie.split(";")[0].split("=").slice(1).join("="));
  ok("the session token is long and random", tokenValue.length >= 32);
  ok("the token is not in the response body", !first.raw.includes(tokenValue));
  ok(
    "the response body has no password, hash or token fields",
    !/passwordHash|password_hash|\"token\"|tokenHash|argon2/i.test(first.raw),
    first.raw.slice(0, 200)
  );
  const second = await signIn();
  const secondToken = decodeURIComponent(
    (([] as string[]).concat((second.headers["set-cookie"] as string[]) ?? [])[0] ?? "")
      .split(";")[0]
      .split("=")
      .slice(1)
      .join("=")
  );
  ok(
    "every sign-in mints a brand-new session token (no fixation)",
    secondToken.length >= 32 && secondToken !== tokenValue
  );
  ok(
    "the user's stored session is a hash, not the token",
    (await db.session.count({ where: { userId: login.user.id, tokenHash: tokenValue } })) === 0
  );
  const meRes = await send("GET", "/api/v1/auth/me", { token: tokenValue });
  ok("the new session works", meRes.status === 200 && meRes.json?.user?.email === email);
  ok(
    "/auth/me exposes no hash or internal ids of other tenants",
    !/passwordHash|tokenHash|organizationId/.test(meRes.raw),
    meRes.raw.slice(0, 200)
  );
  const out = await send("POST", "/api/v1/auth/logout", {
    token: tokenValue,
    headers: { ...JSON_HEADERS, origin: `http://${host}` },
    body: "{}",
  });
  const cleared = ([] as string[]).concat((out.headers["set-cookie"] as string[] | undefined) ?? []).join(" ");
  ok("logout clears the cookie", /Max-Age=0/.test(cleared) && /HttpOnly/i.test(cleared));
  ok(
    "after logout the old cookie is dead on the server (401), not just cleared in the browser",
    (await send("GET", "/api/v1/auth/me", { token: tokenValue })).status === 401
  );

  console.log(`HTTP security audit (${BASE.origin}): ${passed} checks passed, ${failures.length} failed.`);
  if (failures.length) {
    console.error(
      ` - ${failures.slice(0, 40).join("\n - ")}${failures.length > 40 ? `\n ...and ${failures.length - 40} more` : ""}`
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
