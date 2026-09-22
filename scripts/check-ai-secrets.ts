/**
 * Guards the rule "AI provider keys never reach the frontend": run `npm run check:ai-secrets`.
 *
 * STATIC (always): source, config and env examples are scanned for NEXT_PUBLIC_ variables that look secret,
 * for key-shaped literals, for provider secrets referenced outside src/server, for provider SDKs, and for
 * anything in next.config that would inline environment variables into the browser bundle.
 *
 * BUILT OUTPUT (needs `npm run build`; most meaningful when the build ran with the real key variables set):
 * the JavaScript, CSS and pre-rendered HTML that are sent to browsers (.next/static, .next/server/app/*.html)
 * are searched for the actual key values from the environment, key-shaped strings, and the names of the secret
 * variables. Optionally a running app (CHECK_BASE_URL) is fetched and its pages searched the same way.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PUBLIC_KEY_NAMES, publicEnvProblems } from "../public-env-guard";

const problems: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  checks++;
  if (!ok) problems.push(`${name}${detail ? ` - ${detail}` : ""}`);
};

const SECRET_ENV_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_PRICING_JSON",
];
const KEY_SHAPES: [string, RegExp][] = [
  ["an Anthropic-style key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["an OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["a Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["a service-role style JWT", /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
];
const SENSITIVE_PUBLIC =
  /NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|ANTHROPIC|OPENAI|GEMINI|GOOGLE_AI|CLAUDE|SERVICE_ROLE|AI_|LLM)/i;

/** The Supabase anon / publishable key is public by design (reviewed in public-env-guard.ts); its name contains "KEY" only. */
const withoutPublicByDesign = (text: string) => PUBLIC_KEY_NAMES.reduce((t, n) => t.split(n).join(""), text);

function walk(dir: string, filter: (path: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "generated") continue;
      walk(full, filter, out);
    } else if (filter(full)) out.push(full);
  }
  return out;
}
const rel = (p: string) => relative(process.cwd(), p).split(sep).join("/");
const read = (p: string) => readFileSync(p, "utf8");

// ───────────────────────────── static ─────────────────────────────
const srcFiles = walk("src", (p) => /\.(ts|tsx|js|jsx|mjs|json|css)$/.test(p));
const isServerSide = (p: string) => rel(p).startsWith("src/server/") || rel(p).startsWith("src/app/api/");
const frontendFiles = srcFiles.filter((p) => !isServerSide(p));

expect("there is source to scan", srcFiles.length > 50, `${srcFiles.length} files`);
for (const file of srcFiles) {
  const text = read(file);
  const publicVar = SENSITIVE_PUBLIC.exec(withoutPublicByDesign(text));
  expect(`no secret-looking NEXT_PUBLIC_ variable in ${rel(file)}`, !publicVar, publicVar?.[0]);
  for (const [label, re] of KEY_SHAPES) expect(`no literal ${label} in ${rel(file)}`, !re.test(text));
}
for (const file of frontendFiles) {
  const text = read(file);
  for (const name of SECRET_ENV_NAMES)
    expect(`${name} is not referenced by frontend file ${rel(file)}`, !text.includes(name));
  expect(
    `frontend file ${rel(file)} does not import server-only code`,
    !/from\s+["']@\/server\//.test(text) && !/from\s+["']@\/generated\//.test(text)
  );
  expect(
    `frontend file ${rel(file)} does not import a provider SDK`,
    !/from\s+["'](openai|@anthropic-ai\/[^"']+|@google\/(genai|generative-ai)|@supabase\/[^"']+)["']/.test(text)
  );
}
// The AI adapters and config are the only places that read the keys.
for (const file of srcFiles.filter((p) => isServerSide(p))) {
  const text = read(file);
  for (const name of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) {
    if (text.includes(name))
      expect(
        `${name} is read only in src/server/ai/config.ts (found in ${rel(file)})`,
        rel(file) === "src/server/ai/config.ts"
      );
  }
}
expect(
  "the client bundle never gets the AI config module (no frontend file imports src/server/ai)",
  !frontendFiles.some((p) => /server\/ai/.test(read(p)))
);

const configs = ["next.config.ts", "next.config.js", "next.config.mjs"].filter(existsSync);
for (const file of configs) {
  const text = read(file);
  expect(`${file} has no "env" block that inlines variables into the browser bundle`, !/\benv\s*:\s*\{/.test(text));
  expect(`${file} has no publicRuntimeConfig`, !/publicRuntimeConfig/.test(text));
  expect(`${file} does not mention a secret variable`, !SECRET_ENV_NAMES.some((n) => text.includes(n)));
}
const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
expect(
  "no AI provider SDK is installed (adapters call the HTTP APIs directly)",
  !Object.keys(pkg.dependencies ?? {}).some((d) => /^(openai|@anthropic-ai\/|@google\/(genai|generative-ai))/.test(d))
);
for (const file of [
  ".env.example",
  ...walk(".", (p) => /(^|[\\/])\.env(\.[a-z]+)?$/.test(p) && !p.includes("node_modules")).map(rel),
].filter((p, i, a) => existsSync(p) && a.indexOf(p) === i)) {
  const text = read(file);
  expect(
    `${file} declares no NEXT_PUBLIC_ variable that looks secret`,
    !SENSITIVE_PUBLIC.test(withoutPublicByDesign(text))
  );
  if (file === ".env.example") {
    for (const name of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]) {
      expect(`.env.example documents ${name}`, text.includes(name));
      const line = text.split("\n").find((l) => l.replace(/^#\s*/, "").startsWith(`${name}=`));
      expect(`.env.example gives ${name} no value`, !line || /=\s*(""|'')?\s*$/.test(line.replace(/^#\s*/, "")));
    }
  }
}

// The NEXT_PUBLIC_ variables actually set in this environment (CI runs this with the real ones) are safe to publish.
const publicEnv = publicEnvProblems(process.env);
expect("no NEXT_PUBLIC_ variable in the environment holds a secret", publicEnv.length === 0, publicEnv.join("; "));

// ───────────────────────────── built output ─────────────────────────────
const secretValues = SECRET_ENV_NAMES.map((n) => process.env[n]?.trim()).filter(
  (v): v is string => !!v && v.length >= 8 && v.startsWith("{") === false
);
const clientDirs = [".next/static"];
const clientFiles = clientDirs.flatMap((d) => walk(d, (p) => /\.(js|css|html|json|map|txt)$/.test(p)));
const htmlFiles = walk(".next/server/app", (p) => p.endsWith(".html"));
const built = clientFiles.length > 0;
if (!built) console.log("Built output not found (.next). Run `npm run build` first for the browser-bundle scan.");

function scanText(where: string, text: string) {
  for (const value of secretValues) expect(`no configured secret value appears in ${where}`, !text.includes(value));
  for (const [label, re] of KEY_SHAPES) expect(`no ${label} in ${where}`, !re.test(text));
  for (const name of SECRET_ENV_NAMES)
    expect(`the secret variable name ${name} is not in ${where}`, !text.includes(name));
}
if (built) {
  console.log(
    `Scanning ${clientFiles.length} browser files and ${htmlFiles.length} pre-rendered pages` +
      (secretValues.length
        ? `, for ${secretValues.length} secret value(s) from the environment.`
        : ". (No secret variables are set in this environment, so only key shapes and names are searched.)")
  );
  for (const file of clientFiles) scanText(rel(file), read(file));
  for (const file of htmlFiles) scanText(rel(file), read(file));
}

async function scanRunningApp() {
  const base = process.env.CHECK_BASE_URL;
  if (!base) return;
  for (const path of ["/", "/login", "/dashboard", "/inventory", "/ai-assistant", "/settings"]) {
    try {
      const res = await fetch(`${base}${path}`, { redirect: "follow" });
      const html = await res.text();
      scanText(`the served page ${path}`, html);
      // ...and every script it loads
      for (const src of [...html.matchAll(/src="(\/_next\/[^"]+\.js)"/g)].map((m) => m[1]).slice(0, 40)) {
        const js = await fetch(`${base}${src}`)
          .then((r) => r.text())
          .catch(() => "");
        scanText(`served script ${src}`, js);
      }
    } catch {
      // the app is not running: static checks still stand
    }
  }
}

scanRunningApp().finally(() => {
  if (problems.length) {
    console.error(
      `\nAI secrets check FAILED (${checks - problems.length} passed, ${problems.length} failed):\n - ${problems.slice(0, 40).join("\n - ")}`
    );
    process.exit(1);
  }
  console.log(`AI secrets check OK: ${checks} checks passed.`);
});
