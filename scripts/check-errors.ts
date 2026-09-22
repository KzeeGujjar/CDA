/**
 * Offline check (no database, no server) of how the app handles a failed, slow or empty operation:
 *   - every kind of failure is classified correctly (validation, authentication, permission, database, ...), the
 *     server's raw text is never shown for server and database failures, and only transient failures are retried;
 *   - the words for every kind exist in all four languages;
 *   - the real notifier and query client: a failed save is always reported (once), an expired session is announced
 *     once with a Sign in action, a failed first load is left to the screen but a failed refresh behind data is reported;
 *   - the source: no screen can go blank (route error / not-found / loading boundaries exist), every query either shows
 *     its failure or is reported by the banner, nothing spins forever when a request fails, and every ErrorState says
 *     what failed.
 *
 *   npm run check:errors
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { toast } from "sonner";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import ur from "@/locales/ur.json";
import hi from "@/locales/hi.json";
import { classifyError, fieldMessage, shouldAutoRetry, type ErrorKind } from "@/lib/errors/classify";
import { errorMessage } from "@/lib/errors/message";
import { notifyError, setErrorTranslator } from "@/lib/errors/notify";
import { createQueryClient } from "@/lib/query-client";

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

// ── 1. classification ────────────────────────────────────────────────────────────────────────────
const e = (status: number, code: string, message = "server text", extra: object = {}) => ({
  status,
  code,
  message,
  ...extra,
});
const kindOf = (x: unknown) => classifyError(x).kind;
const table: [string, unknown, ErrorKind][] = [
  ["401 unauthorized", e(401, "unauthorized"), "unauthenticated"],
  ["401 invalid_credentials", e(401, "invalid_credentials"), "unauthenticated"],
  ["403 forbidden", e(403, "forbidden"), "forbidden"],
  ["403 email_not_verified", e(403, "email_not_verified"), "forbidden"],
  ["404", e(404, "not_found"), "notFound"],
  ["409 conflict", e(409, "conflict"), "conflict"],
  ["409 business_rule", e(409, "business_rule"), "conflict"],
  ["429", e(429, "rate_limited"), "rateLimited"],
  ["400 validation_error", e(400, "validation_error"), "validation"],
  ["400 weak_password", e(400, "weak_password"), "validation"],
  ["422 no_exchange_rate", e(422, "no_exchange_rate"), "validation"],
  ["413", e(413, "too_large"), "validation"],
  ["503 database_unavailable", e(503, "database_unavailable"), "database"],
  ["503 database_busy", e(503, "database_busy"), "database"],
  ["503 without a code (proxy)", e(503, "x"), "network"],
  ["502", e(502, "x"), "network"],
  ["504", e(504, "x"), "network"],
  ["500 internal_error", e(500, "internal_error"), "server"],
  ["client 'unavailable' marker", { message: "The server could not be reached.", code: "unavailable" }, "network"],
  ["browser fetch failure", new TypeError("Failed to fetch"), "network"],
  ["aborted request", Object.assign(new Error("aborted"), { name: "AbortError" }), "network"],
  ["a plain Error", new Error("boom"), "unknown"],
  ["a string", "boom", "unknown"],
  ["null", null, "unknown"],
  ["undefined", undefined, "unknown"],
];
for (const [name, input, kind] of table) same(`classify: ${name}`, kindOf(input), kind);

const flags = (x: unknown) => {
  const i = classifyError(x);
  return [i.retryable, i.autoRetryable];
};
same(
  "retry: validation, permission, session and missing are never retried",
  [401, 403, 404, 400].map((s) => flags(e(s, "x"))),
  [
    [false, false],
    [false, false],
    [false, false],
    [false, false],
  ]
);
same(
  "retry: database, network and server failures are retried (also silently)",
  [flags(e(503, "database_unavailable")), flags(new TypeError("x")), flags(e(500, "internal_error"))],
  [
    [true, true],
    [true, true],
    [true, true],
  ]
);
same(
  "retry: a conflict and a rate limit may be retried by the user, not silently",
  [flags(e(409, "conflict")), flags(e(429, "rate_limited"))],
  [
    [true, false],
    [true, false],
  ]
);
same(
  "auto-retry rule: twice for a transient failure, never for a 403",
  [
    shouldAutoRetry(0, e(503, "database_busy")),
    shouldAutoRetry(1, e(503, "database_busy")),
    shouldAutoRetry(2, e(503, "database_busy")),
    shouldAutoRetry(0, e(403, "forbidden")),
    shouldAutoRetry(0, e(400, "validation_error")),
  ],
  [true, true, false, false, false]
);

const leak = "SELECT * FROM users WHERE ... 127.0.0.1:5432 constraint vehicles_pkey";
same(
  "the server's text is never kept for server, database, network and permission failures",
  [500, 503, 502, 403, 404, 401].map((s) => classifyError(e(s, s === 503 ? "database_unavailable" : "x", leak)).detail),
  [undefined, undefined, undefined, undefined, undefined, undefined]
);
same(
  "...but is kept for validation, conflict and rate limits (written for people)",
  [400, 409, 429].map((s) => classifyError(e(s, "x", "Choose a stronger password.")).detail),
  ["Choose a stronger password.", "Choose a stronger password.", "Choose a stronger password."]
);
const withFields = classifyError(
  e(400, "validation_error", "Invalid request.", {
    fieldErrors: [
      { path: "password", message: "Too short." },
      { path: "email", message: "Not valid." },
    ],
    requestId: "req-123",
    retryAfterSeconds: 7,
  })
);
same(
  "field errors, request id and retry-after are carried through",
  [
    withFields.fieldErrors.length,
    fieldMessage(withFields, "email"),
    fieldMessage(withFields, "nope"),
    withFields.requestId,
    withFields.retryAfterSeconds,
  ],
  [2, "Not valid.", undefined, "req-123", 7]
);
same("no field errors -> an empty list, never undefined", classifyError(new Error("x")).fieldErrors, []);

// ── 2. one-line messages ─────────────────────────────────────────────────────────────────────────
const t = (key: string) => key.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)?.[p], en) as string;
same(
  "message: validation says what is wrong",
  errorMessage(e(400, "validation_error", "x", { fieldErrors: [{ path: "a", message: "Name is required." }] }), t),
  "Name is required."
);
same(
  "message: a 500 never shows the server's text",
  errorMessage(e(500, "internal_error", leak), t),
  t("errors.server.description")
);
same(
  "message: a database outage says so",
  errorMessage(e(503, "database_unavailable", leak), t),
  t("errors.database.description")
);
same(
  "message: a rate limit says how long to wait",
  errorMessage(e(429, "rate_limited", "Too many.", { retryAfterSeconds: 30 }), t),
  `${t("errors.rateLimited.description")} Try again in 30 seconds.`
);
same(
  "message: sign-in override for a 401",
  errorMessage(e(401, "invalid_credentials"), t, { overrides: { unauthenticated: "Check your details." } }),
  "Check your details."
);
same(
  "message: sign-in shows the server's 403 text (unconfirmed email)",
  errorMessage(e(403, "email_not_verified", "Please confirm your email address before signing in."), t, {
    showServerText: ["forbidden"],
  }),
  "Please confirm your email address before signing in."
);
same(
  "message: without that option a 403 is the generic permission text",
  errorMessage(e(403, "forbidden", "custom"), t),
  t("errors.forbidden.description")
);

// ── 3. the words exist in every language ─────────────────────────────────────────────────────────
const flatten = (o: unknown, prefix = ""): Record<string, string> =>
  Object.entries(o as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === "string") acc[prefix + k] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});
const enErrors = flatten(en.errors);
const kinds: ErrorKind[] = [
  "validation",
  "unauthenticated",
  "forbidden",
  "notFound",
  "conflict",
  "rateLimited",
  "database",
  "server",
  "network",
  "unknown",
];
ok(
  "English has a title and a description for every kind",
  kinds.every((k) => enErrors[`${k}.title`] && enErrors[`${k}.description`])
);
for (const [lang, dict] of [
  ["ar", ar],
  ["ur", ur],
  ["hi", hi],
] as const) {
  const f = flatten(dict.errors);
  same(`${lang}: the same error keys as English`, Object.keys(f).sort(), Object.keys(enErrors).sort());
  ok(
    `${lang}: no empty text`,
    Object.values(f).every((v) => v.trim().length > 0)
  );
  ok(
    `${lang}: every title and description is translated (differs from English)`,
    kinds.every(
      (k) => f[`${k}.title`] !== enErrors[`${k}.title`] && f[`${k}.description`] !== enErrors[`${k}.description`]
    )
  );
  ok(`${lang}: the wait message keeps its {seconds} placeholder`, f.tryAgainIn.includes("{seconds}"));
}
ok("English wait message keeps {seconds}", enErrors.tryAgainIn.includes("{seconds}"));

// ── 4. the real notifier ─────────────────────────────────────────────────────────────────────────
const titles = () => toast.getToasts().map((x) => String((x as { title?: unknown }).title));
for (let i = 0; i < 5; i++) notifyError(e(401, "unauthorized"));
same(
  "an expired session is announced once, however many calls failed",
  toast.getToasts().filter((x) => x.id === "session-expired").length,
  1
);
same(
  "...in words, with a Sign in action",
  [
    titles().includes(en.errors.sessionExpiredToast),
    !!(toast.getToasts().find((x) => x.id === "session-expired") as { action?: { label?: string } })?.action?.label,
  ],
  [true, true]
);
notifyError(e(503, "database_unavailable", leak));
notifyError(e(503, "database_unavailable", leak));
same(
  "a database failure is one toast, in plain words",
  [
    toast.getToasts().filter((x) => (x as { title?: unknown }).title === en.errors.database.title).length,
    JSON.stringify(toast.getToasts()).includes("127.0.0.1"),
  ],
  [1, false]
);
notifyError(
  e(400, "validation_error", "Invalid request.", {
    fieldErrors: [{ path: "password", message: "Choose a stronger password." }],
  })
);
ok(
  "a validation failure shows the field's message",
  JSON.stringify(toast.getToasts()).includes("Choose a stronger password.")
);
setErrorTranslator(
  (key) => (key.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)?.[p], ar) as string) ?? key
);
notifyError(e(500, "internal_error", leak));
ok("toasts speak the user's language once the translator is set (Arabic)", titles().includes(ar.errors.server.title));
setErrorTranslator(null);
notifyError(e(403, "forbidden"));
ok("...and fall back to English without one", titles().includes(en.errors.forbidden.title));

// ── 5. the real query client ─────────────────────────────────────────────────────────────────────
const client = createQueryClient();
const q = client.getDefaultOptions().queries!;
ok(
  "queries never pause behind a spinner when offline",
  q.networkMode === "always" && client.getDefaultOptions().mutations?.networkMode === "always"
);
const retry = q.retry as (n: number, err: unknown) => boolean;
same(
  "queries: no retry for a 403 or 400, two for a database failure",
  [
    retry(0, e(403, "forbidden")),
    retry(0, e(400, "validation_error")),
    retry(0, e(503, "database_busy")),
    retry(2, e(503, "database_busy")),
  ],
  [false, false, true, false]
);
same("mutations are never retried", client.getDefaultOptions().mutations?.retry, false);

async function main() {
  const before = () => toast.getToasts().length;
  const fail = (status: number, code: string) => async () => {
    throw e(status, code, leak);
  };

  // a mutation that fails without its own handler is reported
  const n0 = before();
  await client
    .getMutationCache()
    .build(client, { mutationFn: fail(500, "internal_error") })
    .execute(undefined)
    .catch(() => {});
  ok(
    "a failed save with no handler of its own is reported",
    before() > n0 || titles().includes(en.errors.server.title)
  );
  // ... one with its own onError is left to that handler
  toast.dismiss();
  const own: unknown[] = [];
  const idsBefore = new Set(toast.getToasts().map((x) => x.id));
  await client
    .getMutationCache()
    .build(client, { mutationFn: fail(409, "conflict"), onError: (err) => void own.push(err) })
    .execute(undefined)
    .catch(() => {});
  same(
    "a failed save with its own onError is not reported twice",
    [
      own.length,
      toast
        .getToasts()
        .filter(
          (x) => !idsBefore.has(x.id) && String((x as { title?: unknown }).title).includes(en.errors.conflict.title)
        ).length,
    ],
    [1, 0]
  );
  // ... except an expired session, which always gets the Sign in notice
  const sessionBefore = toast.getToasts().filter((x) => x.id === "session-expired").length;
  await client
    .getMutationCache()
    .build(client, { mutationFn: fail(401, "unauthorized"), onError: () => {} })
    .execute(undefined)
    .catch(() => {});
  ok(
    "an expired session during a save is still announced",
    toast.getToasts().filter((x) => x.id === "session-expired").length >= Math.max(1, sessionBefore)
  );

  // a failed first load is the screen's job; a failed refresh behind data is reported
  const c2 = createQueryClient();
  const idsA = new Set(toast.getToasts().map((x) => x.id));
  await c2
    .fetchQuery({ queryKey: ["first-load"], queryFn: fail(503, "database_unavailable"), retry: false })
    .catch(() => {});
  same(
    "a failed FIRST load makes no toast (the screen shows it)",
    toast.getToasts().filter((x) => !idsA.has(x.id)).length,
    0
  );
  c2.setQueryData(["has-data"], [1, 2, 3]);
  await c2
    .fetchQuery({ queryKey: ["has-data"], queryFn: fail(500, "internal_error"), staleTime: 0, retry: false })
    .catch(() => {});
  ok(
    "a failed REFRESH behind data on screen is reported",
    toast.getToasts().some((x) => !idsA.has(x.id) || x.id === `error:server:${en.errors.server.title}`)
  );
  const sess = toast.getToasts().filter((x) => x.id === "session-expired").length;
  await createQueryClient()
    .fetchQuery({ queryKey: ["s"], queryFn: fail(401, "unauthorized"), retry: false })
    .catch(() => {});
  ok(
    "an expired session on any query is announced (once)",
    toast.getToasts().filter((x) => x.id === "session-expired").length === Math.max(1, sess)
  );

  // ── 6. the source ────────────────────────────────────────────────────────────────────────────
  for (const f of [
    "src/app/error.tsx",
    "src/app/global-error.tsx",
    "src/app/not-found.tsx",
    "src/app/(shell)/error.tsx",
    "src/app/(shell)/loading.tsx",
  ]) {
    ok(`boundary exists: ${f}`, existsSync(f));
  }
  ok(
    "error boundaries offer Retry (reset)",
    ["src/app/error.tsx", "src/app/global-error.tsx", "src/app/(shell)/error.tsx"].every((f) =>
      /reset/.test(readFileSync(f, "utf8"))
    )
  );
  ok(
    "the global error page needs no providers (plain html)",
    /<html/.test(readFileSync("src/app/global-error.tsx", "utf8"))
  );
  ok(
    "the app shell shows the banner for lookup failures",
    /QueryErrorBanner/.test(readFileSync("src/components/layout/app-shell.tsx", "utf8"))
  );
  ok(
    "the layout gives notifications the user's language",
    /ErrorNotifier/.test(readFileSync("src/app/layout.tsx", "utf8"))
  );

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx$/.test(name)) out.push(full);
    }
    return out;
  };
  const rel = (f: string) => relative(".", f).split(sep).join("/");
  const files = [...walk("src/components"), ...walk("src/app").filter((f) => !rel(f).startsWith("src/app/api/"))];

  const silent: string[] = [];
  const forever: string[] = [];
  const vague: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const calls = (code.match(/\buseQuery\(/g) ?? []).length;
    if (calls > 0) {
      const banners = (code.match(/banner:\s*true/g) ?? []).length;
      const handles = /\bisError\b|\.isError\b|\berror=\{|\berror\b\s*[,:}]/.test(code);
      if (!handles && banners < calls) silent.push(`${rel(f)} (${calls} queries, ${banners} reported by the banner)`);
    }
    // "isLoading || !data" shows a skeleton for as long as there is no data, so when the request FAILS it never ends,
    // unless a failure branch comes first (the report tabs return their ErrorState before it).
    const spin = code.search(/\b(isLoading|isPending)\s*\|\|\s*!/);
    if (spin >= 0 && !/\bisError\b|\.isError\b|\berror=\{|\berror\b\s*[,:}]/.test(code.slice(0, spin))) {
      forever.push(rel(f));
    }
    for (const m of code.matchAll(/<ErrorState\b([\s\S]*?)\/>/g))
      if (!/\berror=|\btitle=/.test(m[1])) vague.push(rel(f));
  }
  ok(
    `every query shows its failure or is reported by the banner (${files.length} files)`,
    silent.length === 0,
    `\n     ${silent.join("\n     ")}`
  );
  ok("nothing spins forever when a request fails (no `isLoading || !data`)", forever.length === 0, forever.join(", "));
  ok("every ErrorState says what failed (passes error= or a title)", vague.length === 0, vague.join(", "));
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(() => {
    if (failures.length) {
      console.error(
        `\nErrors check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Errors check OK: ${passed} assertions passed.`);
  });
