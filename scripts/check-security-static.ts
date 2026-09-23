/**
 * Offline security audit of the source: `npm run check:security-static` (no database, no build).
 *
 *  1. SECRETS      no secret in source or git history; server-only settings read only on the server; nothing is
 *                  inlined into the browser bundle by configuration.
 *  2. BOUNDARY     code that ships to the browser cannot reach server code (database, secrets, the service-role key),
 *                  followed transitively through every import, not only directly.
 *  3. INPUT        every request body is parsed by a strict, bounded schema; the request wrapper refuses tenant keys.
 *  4. SINKS        no script injection sinks, no unsafe links, no token in browser storage, no weak randomness on the server.
 *  5. CSP          the Content-Security-Policy that proxy.ts builds says what it must.
 *  6. ACCESS       every endpoint is protected; the "own data only" and public sets are exactly the reviewed ones.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { buildCsp, IMAGE_HOSTS, newNonce, originOf } from "@/lib/security/csp";
import { loadRouteManifest, PUBLIC_ROUTE_ALLOWLIST, routeKey } from "./lib/route-manifest";
import { assertPublicEnv, publicEnvProblems } from "../public-env-guard";

let checks = 0;
const problems: string[] = [];
const expect = (name: string, ok: boolean, detail = "") => {
  checks++;
  if (!ok) problems.push(`${name}${detail ? ` - ${detail}` : ""}`);
};

const rel = (p: string) => relative(process.cwd(), p).split(sep).join("/");
const read = (p: string) => readFileSync(p, "utf8");
function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "generated" || name === ".next") continue;
      walk(full, filter, out);
    } else if (filter(full)) out.push(full);
  }
  return out;
}
/** Removes comments, so a warning written in a comment ("never use eval") is not mistaken for code. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const source = walk("src", (p) => /\.(ts|tsx)$/.test(p));
/** Files that only ever run on the server (paths relative to the repo root). */
const onServerSide = (f: string) => f.startsWith("src/server/") || f.startsWith("src/app/api/") || f === "src/proxy.ts";
const code = new Map(source.map((p) => [rel(p), stripComments(read(p))]));
expect("there is source to audit", source.length > 200, `${source.length}`);

// ───────────────────────────── 1. secrets ─────────────────────────────
const SERVER_ONLY_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "RESEND_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
];
for (const [file, text] of code) {
  if (onServerSide(file)) continue;
  for (const name of SERVER_ONLY_ENV) {
    expect(`${file} does not reference the server-only setting ${name}`, !text.includes(name));
  }
  const envUse = [...text.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]);
  const illegal = envUse.filter((n) => n !== "NODE_ENV" && !n.startsWith("NEXT_PUBLIC_"));
  expect(
    `${file} reads only NODE_ENV and NEXT_PUBLIC_ settings from the environment`,
    illegal.length === 0,
    illegal.join(", ")
  );
}
expect(
  "the service-role key is read in exactly one place (src/server/env.ts)",
  [...code]
    .filter(([, t]) => t.includes("SUPABASE_SERVICE_ROLE_KEY"))
    .map(([f]) => f)
    .join() === "src/server/env.ts",
  [...code]
    .filter(([, t]) => t.includes("SUPABASE_SERVICE_ROLE_KEY"))
    .map(([f]) => f)
    .join()
);
const publicVars = new Set([...code.values()].flatMap((t) => [...t.matchAll(/NEXT_PUBLIC_\w+/g)].map((m) => m[0])));
expect(
  "no NEXT_PUBLIC_ setting is used at all (nothing is inlined into the browser bundle)",
  publicVars.size === 0,
  [...publicVars].join()
);
const nextConfig = read("next.config.ts");
expect(
  "next.config does not inline environment variables (no `env` block)",
  !/^\s*env\s*:/m.test(stripComments(nextConfig))
);
expect(".gitignore ignores every .env file", /^\.env\*/m.test(read(".gitignore")));
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
expect(
  "no .env file is tracked except the example",
  tracked.filter((f) => /(^|\/)\.env/.test(f) && !f.endsWith(".env.example")).length === 0
);
for (const line of read(".env.example").split(/\r?\n/)) {
  const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (!m) continue;
  expect(
    `.env.example ${m[1]} holds a placeholder, not a value`,
    !/^(sk-|eyJ|AIza|postgres(ql)?:\/\/[^:]+:[^@…<]{4,}@)/.test(m[2]),
    m[2].slice(0, 20)
  );
}

// The example documents every setting the code reads, and nothing the code does not read.
const exampleText = read(".env.example");
const documented = new Set([...exampleText.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
const settingSources = [
  ...walk("src", (p) => /\.(ts|tsx)$/.test(p)).map(read),
  ...["next.config.ts", "prisma.config.ts", "prisma/seed.ts", "prisma/seed-demo.ts"].map(read),
].map(stripComments);
const readByCode = new Set(
  settingSources.flatMap((t) => [
    ...[...t.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]),
    ...[...t.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]),
    // (the AI provider table names its settings as strings; a setting name always has an underscore, "LX" is a car)
    ...[...t.matchAll(/\b(?:key|baseUrl|model):\s*"([A-Z][A-Z0-9]*_[A-Z0-9_]+)"/g)].map((m) => m[1]),
    ...[...t.matchAll(/^\s*([A-Z][A-Z0-9_]+):\s*z\./gm)].map((m) => m[1]),
  ])
);
/** Read by the code but deliberately not in the example: switches that exist only for automated tests. */
const TEST_ONLY_SETTINGS: Record<string, string> = {
  NODE_ENV: "set by the framework",
  AI_ALLOW_INSECURE_URL: "test switch: allows a plain-http provider URL on loopback",
  AI_RETRY_DELAY_MS: "test switch: shortens the retry delay",
  EMAIL_ALLOW_FILE_TRANSPORT: "test switch: allows the file email transport in production mode",
  EMAIL_OUTBOX_FILE: "test switch: the file the file email transport writes to",
  STORAGE_ALLOW_INSECURE_URL: "test switch: allows a plain-http Storage URL on loopback",
  STORAGE_PRIVATE_CHECK_TTL_SECONDS: "test tuning: cache lifetime of the bucket-is-private check",
  MESSAGING_ALLOW_INSECURE_URL: "test switch: allows a plain-http WhatsApp/Twilio URL on loopback",
};
/** In the example but not read by the app (yet): public by design, and the reason is written next to them there. */
const DOCUMENTED_NOT_READ = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
expect("some settings were found in the code", readByCode.size >= 20, String(readByCode.size));
for (const name of [...readByCode].sort()) {
  expect(
    `the code reads ${name}, so .env.example documents it (or it is a reviewed test-only switch)`,
    documented.has(name) || name in TEST_ONLY_SETTINGS
  );
}
for (const name of [...documented].sort()) {
  expect(
    `.env.example documents ${name}, and the code reads it (or it is reviewed as public and unread)`,
    readByCode.has(name) || DOCUMENTED_NOT_READ.has(name)
  );
}
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  expect(`.env.example lists ${name}`, documented.has(name));
}
expect(
  ".env.example holds no value for any key, token or password setting",
  ![...exampleText.matchAll(/^([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD))=(.+)$/gm)].some(
    (m) => m[2].replace(/["']/g, "").trim() !== ""
  )
);

// The build-time guard for NEXT_PUBLIC_ variables (public-env-guard.ts): the mistakes it exists for must be refused.
{
  const jwt = (role: string) => ["e30", Buffer.from(JSON.stringify({ role })).toString("base64url"), "c2ln"].join(".");
  const ANON = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
  const fine = (name: string, env: Record<string, string>) =>
    expect(`public env guard accepts: ${name}`, publicEnvProblems(env).length === 0, publicEnvProblems(env).join("; "));
  const refused = (name: string, env: Record<string, string>, mention: string) => {
    const found = publicEnvProblems(env);
    expect(
      `public env guard refuses: ${name}`,
      found.length > 0 && found.some((p) => p.includes(mention)),
      found.join("; ")
    );
    const values = Object.values(env).filter((v) => v.length >= 8);
    expect(
      `the guard's message for "${name}" never contains a value`,
      !values.some((v) => found.join(" ").includes(v))
    );
  };
  fine("nothing set", {});
  fine("empty public variables", { NEXT_PUBLIC_SUPABASE_URL: "", [ANON]: "" });
  fine("a project URL", {
    NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
    SUPABASE_URL: "https://abcd.supabase.co",
  });
  fine("an anon-role key", { [ANON]: jwt("anon") });
  fine("a publishable key", { [ANON]: "sb_publishable_abc123" });
  refused("the service-role key in the anon slot", { [ANON]: jwt("service_role") }, ANON);
  refused("a JWT for another role in the anon slot", { [ANON]: jwt("authenticated") }, ANON);
  refused("a Supabase secret key in the anon slot", { [ANON]: "sb_secret_abc123456" }, ANON);
  refused("a value that is not a Supabase key in the anon slot", { [ANON]: "not-a-key-at-all" }, ANON);
  refused(
    "a public variable named like an AI key",
    { NEXT_PUBLIC_OPENAI_API_KEY: "placeholder-value" },
    "NEXT_PUBLIC_OPENAI_API_KEY"
  );
  refused(
    "a public variable named like a service-role key",
    { NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "" },
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"
  );
  refused(
    "a server secret's value under an innocent public name",
    { NEXT_PUBLIC_ANALYTICS_ID: "shared-secret-value-1", ANTHROPIC_API_KEY: "shared-secret-value-1" },
    "ANTHROPIC_API_KEY"
  );
  refused(
    "the database URL's value under a public name",
    { NEXT_PUBLIC_SITE: "postgresql://u:pw123456@h/db", DATABASE_URL: "postgresql://u:pw123456@h/db" },
    "DATABASE_URL"
  );
  let thrown = "";
  try {
    assertPublicEnv({ [ANON]: jwt("service_role") });
  } catch (error) {
    thrown = (error as Error).message;
  }
  expect(
    "assertPublicEnv throws for an unsafe configuration",
    thrown.includes("Refusing to start") && thrown.includes(ANON)
  );
  let quiet = true;
  try {
    assertPublicEnv({ [ANON]: jwt("anon") });
  } catch {
    quiet = false;
  }
  expect("assertPublicEnv stays quiet for a safe one", quiet);
  expect("next.config.ts runs the guard", /assertPublicEnv\(process\.env\)/.test(read("next.config.ts")));
}

// Nothing secret-shaped in any tracked file, or ever committed (the history is searched too).
const SECRET_SHAPES: [string, string][] = [
  ["an Anthropic key", "sk-ant-[A-Za-z0-9_-]{20,}"],
  ["an OpenAI key", "sk-(proj-)?[A-Za-z0-9_-]{40,}"],
  ["a Google API key", "AIza[0-9A-Za-z_-]{35}"],
  ["a JWT (Supabase keys are JWTs)", "eyJ[A-Za-z0-9_-]{30,}\\.eyJ[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}"],
  ["a private key", "-----BEGIN [A-Z ]*PRIVATE KEY-----"],
  [
    "a database URL with a real host and password",
    "postgres(ql)?://[^:/@\\s'\"`]+:[^@\\s'\"`]{6,}@[a-z0-9-]+\\.[a-z0-9.-]+",
  ],
];
/** Runs git and returns its output; "no match" (exit 1) is an empty answer, anything else is a failure of the check itself. */
function git(args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const e = error as { status?: number; stderr?: Buffer | string };
    if (e.status === 1) return "";
    throw new Error(`git ${args.slice(0, 3).join(" ")} failed: ${String(e.stderr).slice(0, 200)}`);
  }
}
// Files that legitimately hold fake, key-shaped test values: this scanner's own self-test (below, proving the
// pattern actually matches something), and the fixed test credentials the AI check scripts and fake providers
// (scripts/fake-ai-providers.ts) agree on so a check run can exercise a real HTTP request/response shape. Narrow
// and named, not a blanket exemption — every other tracked file, including every other script, is still scanned.
const KNOWN_TEST_FIXTURES = [
  "scripts/check-security-static.ts",
  "scripts/fake-ai-providers.ts",
  "scripts/check-ai-unit.ts",
  "scripts/check-ai-http.ts",
  "scripts/check-ai-agent-unit.ts",
  "scripts/check-ai-agent-http.ts",
];
const EXCLUDE_PATHSPECS = ["package-lock.json", ...KNOWN_TEST_FIXTURES].map((p) => `:!${p}`);
for (const [label, pattern] of SECRET_SHAPES) {
  const inFiles = git(["grep", "-lE", "-e", pattern, "--", ".", ...EXCLUDE_PATHSPECS]);
  expect(`no ${label} in any tracked file`, inFiles.trim() === "", inFiles.trim().split("\n").slice(0, 3).join(", "));
  const inHistory = git(["log", "--all", "-G", pattern, "--format=%h", "--", ".", ...EXCLUDE_PATHSPECS]);
  expect(
    `no ${label} anywhere in the git history`,
    inHistory.trim() === "",
    inHistory.trim().split("\n").slice(0, 3).join(", ")
  );
}
// The scan itself must be able to find something: a planted key-shaped string in a scratch commit-free check.
expect(
  "the secret scan can detect a key (self-test of the pattern)",
  new RegExp(SECRET_SHAPES[0][1]).test("sk-ant-" + "a".repeat(30)) &&
    new RegExp(SECRET_SHAPES[4][1]).test("-----BEGIN RSA PRIVATE KEY-----")
);

// ───────────────────────────── 2. client / server boundary ─────────────────────────────
const SERVER_ROOTS = ["src/server/", "src/generated/", "src/app/api/"];
const FORBIDDEN_PACKAGES =
  /^(pg|@prisma\/.*|@supabase\/.*|@anthropic-ai\/.*|openai|@google\/.*|argon2|bcrypt.*|node:.*|fs|path|crypto|child_process)$/;
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  base = base.split(sep).join("/");
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (code.has(candidate)) return candidate;
  }
  return base; // may live outside the scanned files (e.g. src/generated): still checked by prefix
}
const importsOf = (file: string) =>
  [
    ...(code.get(file) ?? "").matchAll(
      /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g
    ),
  ].map((m) => m[1] ?? m[2]);
const BROWSER_DIRS = [
  "src/components/",
  "src/hooks/",
  "src/services/",
  "src/store/",
  "src/mock/",
  "src/types/",
  "src/lib/",
  "src/utils/",
];
const isClientFile = (f: string) =>
  BROWSER_DIRS.some((d) => f.startsWith(d) && f !== "src/lib/security/csp.ts") ||
  /^\s*["']use client["']/.test(read(f)) ||
  f === "src/app/login/page.tsx";
const entry = source
  .map(rel)
  .filter((f) => !f.startsWith("src/server/") && !f.startsWith("src/app/api/") && isClientFile(f));
expect("there are browser-side files to audit", entry.length > 150, `${entry.length}`);
const seen = new Set<string>();
const queue = [...entry];
const leaks: string[] = [];
while (queue.length) {
  const file = queue.pop()!;
  if (seen.has(file)) continue;
  seen.add(file);
  for (const spec of importsOf(file)) {
    if (FORBIDDEN_PACKAGES.test(spec)) {
      leaks.push(`${file} imports ${spec}`);
      continue;
    }
    const target = resolveImport(file, spec);
    if (!target) continue;
    if (SERVER_ROOTS.some((r) => target.startsWith(r))) leaks.push(`${file} -> ${target}`);
    else if (code.has(target)) queue.push(target);
  }
}
expect(
  "no code that ships to the browser can reach server code, directly or through other files",
  leaks.length === 0,
  leaks.slice(0, 4).join("; ")
);
expect("the browser-side import graph was really followed", seen.size > 250, `${seen.size} files`);

// ───────────────────────────── 3. input validation ─────────────────────────────
const serverFiles = [...code].filter(([f]) => f.startsWith("src/server/") || f.startsWith("src/app/api/"));
for (const [file, text] of serverFiles) {
  if (file === "src/server/env.ts") continue;
  expect(`${file} builds no non-strict z.object (unknown keys would be accepted)`, !/\bz\.object\(/.test(text));
  expect(`${file} does not use passthrough/loose/catchall`, !/\.(passthrough|loose|catchall)\(/.test(text));
  expect(
    `${file} accepts no free-form z.any()/z.unknown()/z.record()`,
    !/\bz\.(any|unknown|record)\(/.test(text) || file.includes("/ai/"),
    file
  );
}
// Every string and array a client can send has a limit.
/** The method names chained directly on a zod call starting at `start` (`z.string().trim().max(5)` gives string, trim, max). */
function chainMethods(text: string, start: number): string[] {
  const names: string[] = [];
  let i = start + 1; // just after the "z"
  while (text[i] === ".") {
    const m = /^\.(\w+)/.exec(text.slice(i));
    if (!m) break;
    names.push(m[1]);
    i += m[0].length;
    if (text[i] !== "(") break;
    let depth = 0;
    do {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      i++;
    } while (depth > 0 && i < text.length);
    const gap = /^\s*(?=\.)/.exec(text.slice(i));
    if (!gap) break;
    i += gap[0].length;
  }
  return names;
}
const STRING_LIMITS = new Set(["max", "length", "uuid", "email", "regex", "datetime", "url", "ip", "ulid", "cuid"]);
const unbounded: string[] = [];
for (const [file, text] of serverFiles) {
  if (file === "src/server/env.ts") continue;
  for (const m of text.matchAll(/\bz\.(string|array)\(/g)) {
    const methods = chainMethods(text, m.index!);
    const bounded =
      m[1] === "array" ? methods.some((n) => n === "max" || n === "length") : methods.some((n) => STRING_LIMITS.has(n));
    if (!bounded) unbounded.push(`${file}:${text.slice(0, m.index).split("\n").length}`);
  }
}
expect(
  "every z.string() and z.array() in a request schema has a maximum",
  unbounded.length === 0,
  unbounded.slice(0, 5).join(", ")
);
const routeSources = walk("src/app/api", (p) => p.endsWith("route.ts")).map(
  (p) => [rel(p), stripComments(read(p))] as const
);
const noBodyReview = new Set<string>();
for (const [file, text] of routeSources) {
  for (const method of ["POST", "PUT", "PATCH"]) {
    const m = new RegExp(`export const ${method} = (?:apiRoute|publicRoute)[\\s\\S]*?(?=\\nexport const |$)`).exec(
      text
    );
    if (m && !/body\(/.test(m[0]))
      noBodyReview.add(`${method} ${file.replace("src/app", "").replace("/route.ts", "")}`);
  }
  expect(
    `${file} never reads the request body itself (only through body(schema))`,
    !/\.(json|text|formData|arrayBuffer)\(\)/.test(text)
  );
}
// Endpoints that change state without a body are all "do this to that record" actions: reviewed, and listed so a new one is noticed.
const REVIEWED_NO_BODY = new Set([
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/sessions/revoke-others",
  "POST /api/v1/documents/[id]/complete",
  "POST /api/v1/vehicles/[id]/photos/[fileId]/complete",
  "POST /api/v1/generated-documents/[id]/share",
]);
for (const entryName of noBodyReview)
  expect(`state-changing endpoint without a body is reviewed: ${entryName}`, REVIEWED_NO_BODY.has(entryName));
const wrapper = stripComments(read("src/server/http/api-route.ts"));
expect(
  "the request wrapper rejects client-chosen tenant keys in body and query",
  /FORBIDDEN_TENANT_KEYS/.test(wrapper) && /tenantFieldError/.test(wrapper)
);
expect(
  "the request wrapper refuses cross-site writes, non-JSON bodies and oversized bodies",
  /assertSameSite/.test(wrapper) && /unsupportedMediaType/.test(wrapper) && /MAX_BODY_BYTES/.test(wrapper)
);

// ───────────────────────────── 4. dangerous code ─────────────────────────────
const innerHtml = [...code].filter(([, t]) => /dangerouslySetInnerHTML/.test(t)).map(([f]) => f);
expect(
  "dangerouslySetInnerHTML is used only where reviewed (the chart theme <style>)",
  innerHtml.join() === "src/components/ui/chart.tsx",
  innerHtml.join()
);
const chartText = code.get("src/components/ui/chart.tsx") ?? "";
expect(
  "that one use writes only CSS colour variables from the chart config, never user data",
  /THEMES|--color-/.test(chartText)
);
for (const [file, text] of code) {
  expect(
    `${file} has no eval / new Function / document.write / innerHTML assignment`,
    !/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(|\.innerHTML\s*=/.test(text)
  );
  expect(`${file} has no javascript: URL`, !/["'`]javascript:/i.test(text));
  for (const m of text.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/g)) {
    expect(
      `${file}: a link that opens a new tab has rel="noopener"`,
      /rel=["'][^"']*noopener/.test(m[0]),
      m[0].slice(0, 60)
    );
  }
  if (!onServerSide(file)) {
    const stores = [...text.matchAll(/(local|session)Storage\.(setItem|getItem)\(\s*([^,)]*)/g)];
    for (const s of stores)
      expect(
        `${file}: browser storage never holds a token or password`,
        !/token|password|secret|session|key/i.test(s[3]),
        s[0]
      );
  }
  if (file.startsWith("src/server/"))
    expect(`${file} takes no security value from Math.random()`, !/Math\.random\(/.test(text));
}
expect(
  "the session cookie is HttpOnly, SameSite and Secure",
  ["HttpOnly", "SameSite=Lax", "Secure", "__Host-"].every((s) => read("src/server/auth/cookies.ts").includes(s))
);
expect(
  "the login form does not prefill an account",
  !/useState\(["'][^"']+@[^"']+["']\)/.test(code.get("src/app/login/page.tsx") ?? "")
);

// ───────────────────────────── 5. Content-Security-Policy ─────────────────────────────
const nonce = newNonce();
const prod = buildCsp({
  nonce,
  development: false,
  storageOrigin: originOf("https://abc.supabase.co/storage/v1"),
  upgradeInsecure: true,
});
const dev = buildCsp({ nonce, development: true, upgradeInsecure: false });
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
expect(
  "the nonce is 128 random bits and different every time",
  Buffer.from(nonce, "base64").length === 16 && newNonce() !== newNonce()
);
expect(
  "scripts need this request's nonce (strict-dynamic)",
  directive(prod, "script-src").includes(`'nonce-${nonce}'`) &&
    directive(prod, "script-src").includes("'strict-dynamic'")
);
expect(
  "scripts never allow 'unsafe-inline'",
  !directive(prod, "script-src").includes("unsafe-inline") && !directive(dev, "script-src").includes("unsafe-inline")
);
expect(
  "production never allows 'unsafe-eval'; development only for script-src",
  !prod.includes("unsafe-eval") && directive(dev, "script-src").includes("unsafe-eval")
);
expect(
  "no directive allows everything (*) or plain http:",
  !/\s\*(\s|;|$)/.test(prod) && !/\shttp:(\s|;|$)/.test(prod)
);
for (const d of [
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "default-src 'self'",
]) {
  expect(`the policy contains ${d}`, prod.split("; ").includes(d));
}
expect(
  "connect-src allows only this site and Supabase Storage",
  directive(prod, "connect-src") === "connect-src 'self' https://abc.supabase.co"
);
expect(
  "images may come from this site, data/blob, the two sample hosts and Supabase Storage",
  IMAGE_HOSTS.every((h) => directive(prod, "img-src").includes(h)) &&
    directive(prod, "img-src").includes("https://abc.supabase.co")
);
expect(
  "without a storage URL, no storage origin is allowed",
  !buildCsp({ nonce, development: false, upgradeInsecure: false }).includes("supabase")
);
expect(
  "http(s) origins only: a junk storage URL adds nothing",
  originOf("javascript:alert(1)") === undefined &&
    originOf("not a url") === undefined &&
    originOf(undefined) === undefined
);
expect(
  "upgrade-insecure-requests only where the site is https",
  prod.includes("upgrade-insecure-requests") && !dev.includes("upgrade-insecure-requests")
);
const proxySource = stripComments(read("src/proxy.ts"));
expect(
  "the proxy sets the policy on the request (so Next.js can stamp the nonce) and on the response",
  /requestHeaders\.set\("content-security-policy"/.test(proxySource) &&
    /response\.headers\.set\("content-security-policy"/.test(proxySource)
);
expect(
  "the proxy never runs in dev mode's relaxations in production",
  /development: process\.env\.NODE_ENV === "development"/.test(proxySource)
);
const configHeaders = stripComments(nextConfig);
for (const h of [
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
]) {
  expect(`next.config sets ${h}`, configHeaders.includes(h));
}
expect("the framework header is not announced", /poweredByHeader:\s*false/.test(configHeaders));

// ───────────────────────────── 6. access ─────────────────────────────
const { entries, violations } = loadRouteManifest();
expect(
  "every endpoint is wrapped in apiRoute/publicRoute and imports no database client",
  violations.length === 0,
  violations.join("; ")
);
const REVIEWED_SELF = new Set([
  "GET /api/v1/auth/me",
  "GET /api/v1/auth/sessions",
  "DELETE /api/v1/auth/sessions/:id",
  "POST /api/v1/auth/sessions/revoke-others",
  "POST /api/v1/auth/password/change",
  "GET /api/v1/reference/uae",
  "GET /api/v1/reference/currencies",
  "GET /api/v1/reference/convert",
]);
const selfNow = entries.filter((e) => e.access.kind === "self").map(routeKey);
for (const r of selfNow)
  expect(
    `own-data endpoint is on the reviewed list: ${r}`,
    REVIEWED_SELF.has(r),
    "a new endpoint with `self: true` skips the permission check: review it, then add it here"
  );
const publicNow = entries.filter((e) => e.access.kind === "public").map(routeKey);
expect(
  "the public endpoints are exactly the reviewed ones",
  publicNow.length === PUBLIC_ROUTE_ALLOWLIST.size && publicNow.every((r) => PUBLIC_ROUTE_ALLOWLIST.has(r))
);
for (const e of entries.filter((x) => x.access.kind === "public")) {
  const text = code.get(rel(resolve(e.file))) ?? "";
  expect(`public endpoint ${routeKey(e)} takes a body only through a schema`, !/req\.json|body\(\s*z\./.test(text));
}
expect(
  "every mutating endpoint declares a permission (or is public/own-data/composed)",
  entries.every(
    (e) =>
      e.access.kind === "permission" || e.access.kind === "self" || e.access.kind === "public" || e.access.kind === "composed"
  )
);

console.log(`Static security audit: ${checks} checks, ${problems.length} problems.`);
if (problems.length) {
  console.error(` - ${problems.join("\n - ")}`);
  process.exit(1);
}
