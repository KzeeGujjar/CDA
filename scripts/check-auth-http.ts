/**
 * End-to-end authentication check over real HTTP. Run with `npm run check:auth` against a RUNNING app
 * (`next start`) on a THROWAWAY, migrated + seeded database. The app must be started with:
 *   EMAIL_TRANSPORT=file EMAIL_OUTBOX_FILE=<file> EMAIL_ALLOW_FILE_TRANSPORT=1 COOKIE_SECURE=false
 *   APP_URL=http://localhost:3100 PASSWORD_BREACH_CHECK=off DATABASE_URL=<cda_app> DIRECT_DATABASE_URL=<owner>
 * and this script needs the same EMAIL_OUTBOX_FILE, COOKIE_SECURE and DIRECT_DATABASE_URL (plus
 * DATABASE_URL to prove the runtime role cannot read the rate-limit table), and CHECK_DB_ALLOW_WRITES=1.
 *
 * Emails are captured to the outbox file, so the real verify / reset / invitation links are used.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
const outbox = process.env.EMAIL_OUTBOX_FILE;
if (!ownerUrl || !outbox) throw new Error("Set DIRECT_DATABASE_URL and EMAIL_OUTBOX_FILE.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
const PASSWORD = "Tr1cky-Horse-Battery-Staple";
const NEW_PASSWORD = "Another-Very-Long-Passphrase-9";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};

// ── HTTP helper ────────────────────────────────────────────────────────────────────────────────
const allBodies: string[] = [];
const secretsSeen = new Set<string>(); // raw tokens/passwords that must never appear in any response

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  headers: Headers;
  setCookies: string[];
}
async function call(
  path: string,
  init: { token?: string; method?: string; body?: unknown; headers?: Record<string, string>; ip?: string } = {}
): Promise<Res> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.token) headers.cookie = `${sessionCookieName()}=${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.ip) headers["x-real-ip"] = init.ip;
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  allBodies.push(text);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // no body
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any, headers: res.headers, setCookies: res.headers.getSetCookie() };
}
const cookieToken = (r: Res) => {
  const c = r.setCookies.find((x) => x.startsWith(`${sessionCookieName()}=`));
  return c ? decodeURIComponent(c.split(";")[0].slice(sessionCookieName().length + 1)) : undefined;
};

// unique client IPs per scenario keep the (intentional) per-IP limits from interfering
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];
const nextIp = () => `10.${runOctets[0]}.${runOctets[1] + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

// ── outbox (captured emails) ───────────────────────────────────────────────────────────────────
interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
const readOutbox = (): Mail[] =>
  existsSync(outbox)
    ? readFileSync(outbox, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
async function waitForMail(to: string, subjectPart: string, after = 0, timeoutMs = 8000): Promise<Mail | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = readOutbox()
      .slice(after)
      .reverse()
      .find((x) => x.to === to && x.subject.includes(subjectPart));
    if (m) return m;
    await sleep(150);
  }
  return null;
}
const tokenFrom = (mail: Mail) => decodeURIComponent(/token=([A-Za-z0-9_%-]+)/.exec(mail.text)![1]);
const mailCount = () => readOutbox().length;

// ── scenario helpers ───────────────────────────────────────────────────────────────────────────
const strongBody = (email: string, org: string) => ({
  organizationName: org,
  name: "Omar Al Test",
  email,
  password: PASSWORD,
});

async function registerVerified(label: string) {
  const email = `${label}-${suffix}@example.com`;
  const ip = nextIp();
  const before = mailCount();
  const reg = await call("/api/v1/auth/register", {
    method: "POST",
    body: strongBody(email, `${label} Motors ${suffix}`),
    ip,
  });
  if (reg.status !== 202) throw new Error(`register ${label} failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  const mail = await waitForMail(email, "Confirm", before);
  if (!mail) throw new Error(`no verification email for ${label}`);
  const v = await call("/api/v1/auth/verify-email", { method: "POST", body: { token: tokenFrom(mail) }, ip });
  if (v.status !== 200) throw new Error(`verify ${label} failed`);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  return { email, user, orgId: user.organizationId };
}
async function loginAs(email: string, password = PASSWORD, ip = nextIp(), headers: Record<string, string> = {}) {
  const r = await call("/api/v1/auth/login", { method: "POST", body: { email, password }, ip, headers });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: cookieToken(r)!, res: r };
}

async function main() {
  // ═══════════════════════ REGISTRATION & EMAIL VERIFICATION ═══════════════════════
  const ipR = nextIp();
  const weak = await call("/api/v1/auth/register", {
    method: "POST",
    body: { ...strongBody(`w-${suffix}@example.com`, "Weak Co"), password: "password123" },
    ip: ipR,
  });
  ok(
    "weak password is rejected with guidance",
    weak.status === 400 && weak.json.code === "weak_password" && weak.json.fieldErrors?.length > 0
  );
  const badEmail = await call("/api/v1/auth/register", {
    method: "POST",
    body: { ...strongBody("not-an-email", "X Co") },
    ip: ipR,
  });
  ok("invalid email is rejected", badEmail.status === 400 && badEmail.json.code === "validation_error");
  const nameInPw = await call("/api/v1/auth/register", {
    method: "POST",
    body: { ...strongBody(`n-${suffix}@example.com`, "N Co"), password: "MyNameIsOmarAlTest!" },
    ip: ipR,
  });
  ok("password containing the name is rejected", nameInPw.status === 400 && nameInPw.json.code === "weak_password");
  const tenantKey = await call("/api/v1/auth/register", {
    method: "POST",
    body: { ...strongBody(`t-${suffix}@example.com`, "T Co"), organizationId: "someone-elses" },
    ip: ipR,
  });
  ok(
    "registration rejects a client-supplied organizationId",
    tenantKey.status === 400 && tenantKey.json.code === "tenant_field_not_allowed"
  );
  const unknownField = await call("/api/v1/auth/register", {
    method: "POST",
    body: { ...strongBody(`u-${suffix}@example.com`, "U Co"), role: "superAdmin" },
    ip: ipR,
  });
  ok(
    "registration rejects unknown fields (no role/privilege injection)",
    unknownField.status === 400 && unknownField.json.code === "validation_error"
  );

  const ownerEmail = `owner-${suffix}@example.com`;
  const ipA = nextIp();
  const beforeReg = mailCount();
  const reg = await call("/api/v1/auth/register", {
    method: "POST",
    body: strongBody(ownerEmail, `Alpha Motors ${suffix}`),
    ip: ipA,
  });
  ok("registration is accepted (202)", reg.status === 202);
  const created = await db.user.findUnique({
    where: { email: ownerEmail },
    include: { role: true, organization: true },
  });
  ok(
    "user is created PENDING_VERIFICATION",
    created?.status === "PENDING_VERIFICATION" && created.emailVerifiedAt === null
  );
  ok(
    "password is stored only as an Argon2id hash",
    !!created?.passwordHash?.startsWith("$argon2id$") && !created.passwordHash.includes(PASSWORD)
  );
  ok(
    "registrant owns a NEW organization as Dealer Owner",
    created?.role.key === "dealerOwner" &&
      created.organization.name === `Alpha Motors ${suffix}` &&
      created.organization.type === "DEALERSHIP"
  );
  ok(
    "the new organization has its 7 built-in roles",
    (await db.role.count({ where: { organizationId: created!.organizationId } })) === 7
  );
  ok(
    "a primary branch exists and the owner is assigned to it",
    (await db.userBranch.count({ where: { userId: created!.id, isPrimary: true } })) === 1
  );
  ok(
    "registration was audited",
    (await db.auditLog.count({
      where: { organizationId: created!.organizationId, action: "organization.registered" },
    })) === 1
  );

  const verifyMail = await waitForMail(ownerEmail, "Confirm", beforeReg);
  ok(
    "a verification email is sent to the registrant",
    !!verifyMail && verifyMail.text.includes("/verify-email?token=")
  );
  const verifyToken = tokenFrom(verifyMail!);
  secretsSeen.add(verifyToken);
  const stored = await db.authToken.findFirst({ where: { userId: created!.id, purpose: "EMAIL_VERIFICATION" } });
  ok(
    "only the SHA-256 of the verification token is stored",
    stored?.tokenHash === sha256(verifyToken) && stored.tokenHash !== verifyToken
  );

  const mailsBefore = mailCount();
  const dup = await call("/api/v1/auth/register", {
    method: "POST",
    body: strongBody(ownerEmail, "Another Name"),
    ip: nextIp(),
  });
  ok(
    "registering an existing email gives the SAME response (no account enumeration)",
    dup.status === 202 && JSON.stringify(dup.json) === JSON.stringify(reg.json)
  );
  ok("still exactly one user for that email", (await db.user.count({ where: { email: ownerEmail } })) === 1);
  const existsMail = await waitForMail(ownerEmail, "already have an account", mailsBefore);
  ok(
    "the existing owner is emailed instead (and no second verification token exists)",
    !!existsMail && (await db.authToken.count({ where: { userId: created!.id, purpose: "EMAIL_VERIFICATION" } })) === 1
  );

  const early = await call("/api/v1/auth/login", {
    method: "POST",
    body: { email: ownerEmail, password: PASSWORD },
    ip: nextIp(),
  });
  ok(
    "correct password before verification -> 403 email_not_verified",
    early.status === 403 && early.json.code === "email_not_verified" && !cookieToken(early)
  );
  const earlyWrong = await call("/api/v1/auth/login", {
    method: "POST",
    body: { email: ownerEmail, password: "wrong-password-123" },
    ip: nextIp(),
  });
  ok(
    "WRONG password before verification reveals nothing (generic 401)",
    earlyWrong.status === 401 && earlyWrong.json.code === "invalid_credentials"
  );

  const junkVerify = await call("/api/v1/auth/verify-email", {
    method: "POST",
    body: { token: "x".repeat(43) },
    ip: nextIp(),
  });
  ok(
    "verifying with a bogus token -> 400",
    junkVerify.status === 400 && junkVerify.json.code === "invalid_or_expired_token"
  );
  const goodVerify = await call("/api/v1/auth/verify-email", {
    method: "POST",
    body: { token: verifyToken },
    ip: nextIp(),
  });
  ok("verifying with the emailed token -> 200", goodVerify.status === 200);
  const verifiedUser = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  ok(
    "account becomes ACTIVE with emailVerifiedAt",
    verifiedUser.status === "ACTIVE" && verifiedUser.emailVerifiedAt !== null
  );
  const reuse = await call("/api/v1/auth/verify-email", { method: "POST", body: { token: verifyToken }, ip: nextIp() });
  ok("a verification token cannot be reused", reuse.status === 400);
  const resendKnown = await call("/api/v1/auth/resend-verification", {
    method: "POST",
    body: { email: ownerEmail },
    ip: nextIp(),
  });
  const resendUnknown = await call("/api/v1/auth/resend-verification", {
    method: "POST",
    body: { email: `nobody-${suffix}@example.com` },
    ip: nextIp(),
  });
  ok(
    "resend-verification answers identically for known and unknown addresses",
    resendKnown.status === 202 && JSON.stringify(resendKnown.json) === JSON.stringify(resendUnknown.json)
  );

  // per-IP registration limit (5/hour)
  const limitedIp = nextIp();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    statuses.push(
      (
        await call("/api/v1/auth/register", {
          method: "POST",
          body: { ...strongBody(`lim${i}-${suffix}@example.com`, "Lim Co"), password: "short" },
          ip: limitedIp,
        })
      ).status
    );
  }
  ok(
    "registration is limited per IP (6th request in an hour -> 429)",
    statuses.slice(0, 5).every((s) => s === 400) && statuses[5] === 429,
    statuses.join(",")
  );

  // ═══════════════════════ LOGIN ═══════════════════════
  const ipL = nextIp();
  const wrongPw = await call("/api/v1/auth/login", {
    method: "POST",
    body: { email: ownerEmail, password: "definitely-wrong-1" },
    ip: ipL,
  });
  const unknown = await call("/api/v1/auth/login", {
    method: "POST",
    body: { email: `ghost-${suffix}@example.com`, password: "definitely-wrong-1" },
    ip: ipL,
  });
  ok(
    "wrong password and unknown email are indistinguishable",
    wrongPw.status === 401 &&
      unknown.status === 401 &&
      wrongPw.json.message === unknown.json.message &&
      wrongPw.json.code === unknown.json.code
  );

  const loginRes = await call("/api/v1/auth/login", {
    method: "POST",
    body: { email: ownerEmail, password: PASSWORD },
    ip: ipL,
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36" },
  });
  const tokenOwner = cookieToken(loginRes)!;
  ok(
    "login succeeds",
    loginRes.status === 200 &&
      loginRes.json.user.email === ownerEmail &&
      loginRes.json.organization.id === verifiedUser.organizationId
  );
  const cookie = loginRes.setCookies.find((c) => c.startsWith(`${sessionCookieName()}=`))!;
  ok(
    "session cookie is HttpOnly, SameSite=Lax, Path=/, with a Max-Age and no Domain",
    /HttpOnly/.test(cookie) &&
      /SameSite=Lax/.test(cookie) &&
      /Path=\//.test(cookie) &&
      /Max-Age=\d+/.test(cookie) &&
      !/Domain=/i.test(cookie),
    cookie
  );
  ok(
    "the session token is NOT in the response body",
    !JSON.stringify(loginRes.json).includes(tokenOwner) && !("token" in loginRes.json)
  );
  secretsSeen.add(tokenOwner);
  ok("login response has no password hash", !/argon2|passwordHash|password_hash/i.test(JSON.stringify(loginRes.json)));
  const me = await call("/api/v1/auth/me", { token: tokenOwner });
  ok("the cookie authenticates /auth/me", me.status === 200 && me.json.user.id === verifiedUser.id);
  const sessionRow = await db.session.findFirst({ where: { userId: verifiedUser.id }, orderBy: { createdAt: "desc" } });
  ok(
    "only the SHA-256 of the session token is stored",
    sessionRow?.tokenHash === sha256(tokenOwner) && !(await db.session.findFirst({ where: { tokenHash: tokenOwner } }))
  );
  const afterLogin = await db.user.findUniqueOrThrow({ where: { id: verifiedUser.id } });
  ok(
    "lastLoginAt is recorded and the failure counter is reset",
    afterLogin.lastLoginAt !== null && afterLogin.failedLoginCount === 0
  );
  const second = await loginAs(ownerEmail);
  ok("every login mints a brand-new session token (no fixation)", second.token !== tokenOwner);

  ok(
    "login rejects a client-supplied tenant key",
    (
      await call("/api/v1/auth/login", {
        method: "POST",
        body: { email: ownerEmail, password: PASSWORD, tenantId: "x" },
        ip: nextIp(),
      })
    ).json.code === "tenant_field_not_allowed"
  );
  ok(
    "login rejects a cross-site Origin",
    (
      await call("/api/v1/auth/login", {
        method: "POST",
        body: { email: ownerEmail, password: PASSWORD },
        ip: nextIp(),
        headers: { origin: "https://evil.example" },
      })
    ).status === 403
  );
  ok(
    "login rejects malformed input",
    (await call("/api/v1/auth/login", { method: "POST", body: { email: "nope", password: "" }, ip: nextIp() }))
      .status === 400
  );

  // throttling: per email (10 / 15 min), identical for known and unknown addresses
  for (const [label, email] of [
    ["known", ownerEmail],
    ["unknown", `nobody2-${suffix}@example.com`],
  ] as const) {
    const probe = label === "known" ? (await registerVerified(`thr${label}`)).email : email;
    const seq: number[] = [];
    for (let i = 0; i < 12; i++)
      seq.push(
        (
          await call("/api/v1/auth/login", {
            method: "POST",
            body: { email: probe, password: `wrong-attempt-${i}-x` },
            ip: nextIp(),
          })
        ).status
      );
    ok(
      `throttle (${label} email): 10 failures then 429`,
      seq.slice(0, 10).every((s) => s === 401) && seq[10] === 429 && seq[11] === 429,
      seq.join(",")
    );
    if (label === "known") {
      const blocked = await call("/api/v1/auth/login", {
        method: "POST",
        body: { email: probe, password: PASSWORD },
        ip: nextIp(),
      });
      ok(
        "while throttled even the CORRECT password is refused, with Retry-After",
        blocked.status === 429 && Number(blocked.headers.get("retry-after")) > 0
      );
    }
  }
  // throttle per IP (30 / 15 min) across different emails
  const floodIp = nextIp();
  const flood: number[] = [];
  for (let i = 0; i < 32; i++)
    flood.push(
      (
        await call("/api/v1/auth/login", {
          method: "POST",
          body: { email: `flood${i}-${suffix}@example.com`, password: "whatever-pass-1" },
          ip: floodIp,
        })
      ).status
    );
  ok(
    "throttle per IP: 30 attempts then 429",
    flood.slice(0, 30).every((s) => s === 401) && flood[30] === 429,
    flood.join(",")
  );

  // hash upgrade on login
  const legacy = await registerVerified("legacy");
  const weakHash = await hash(PASSWORD, { memoryCost: 4096, timeCost: 1, parallelism: 1, algorithm: 2 });
  await db.user.update({ where: { id: legacy.user.id }, data: { passwordHash: weakHash } });
  await loginAs(legacy.email);
  const upgraded = await db.user.findUniqueOrThrow({ where: { id: legacy.user.id } });
  ok(
    "a weaker hash is transparently upgraded after a successful login",
    upgraded.passwordHash!.includes("m=19456,t=2,p=1") && upgraded.passwordHash !== weakHash
  );

  // ═══════════════════════ SESSIONS & LOGOUT ═══════════════════════
  const u = await registerVerified("sess");
  const s1 = await loginAs(u.email, PASSWORD, nextIp(), {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) Firefox/121.0",
  });
  const s2 = await loginAs(u.email, PASSWORD, nextIp(), { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Edg/120.0" });
  const list = await call("/api/v1/auth/sessions", { token: s1.token });
  ok("lists exactly the caller's live sessions", list.status === 200 && list.json.length === 2);
  ok(
    "exactly one is marked current, and it is the caller's",
    list.json.filter((s: { current: boolean }) => s.current).length === 1
  );
  ok(
    "session DTO exposes no token or hash",
    list.json.every((s: object) => !("token" in s) && !("tokenHash" in s)) &&
      !JSON.stringify(list.json).includes(s1.token)
  );
  ok(
    "sessions carry a readable device label",
    list.json.some((s: { device: string }) => s.device === "Firefox on macOS") &&
      list.json.some((s: { device: string }) => s.device === "Edge on Windows")
  );
  const otherId = list.json.find((s: { current: boolean }) => !s.current).id;
  const revokeOther = await call(`/api/v1/auth/sessions/${otherId}`, { method: "DELETE", token: s1.token });
  ok("revoking another of my sessions works", revokeOther.status === 200);
  ok(
    "the revoked session stops working immediately",
    (await call("/api/v1/auth/me", { token: s2.token })).status === 401
  );
  ok(
    "revoking it again -> 404",
    (await call(`/api/v1/auth/sessions/${otherId}`, { method: "DELETE", token: s1.token })).status === 404
  );
  const foreign = await db.session.findFirstOrThrow({ where: { userId: verifiedUser.id } });
  ok(
    "revoking someone else's session id -> 404 (and it stays valid)",
    (await call(`/api/v1/auth/sessions/${foreign.id}`, { method: "DELETE", token: s1.token })).status === 404 &&
      (await db.session.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt === null
  );
  const s3 = await loginAs(u.email);
  const revokeAll = await call("/api/v1/auth/sessions/revoke-others", { method: "POST", token: s1.token });
  ok(
    "revoke-others signs out every other session and keeps this one",
    revokeAll.status === 200 &&
      revokeAll.json.revoked >= 1 &&
      (await call("/api/v1/auth/me", { token: s3.token })).status === 401 &&
      (await call("/api/v1/auth/me", { token: s1.token })).status === 200
  );

  const out = await call("/api/v1/auth/logout", { method: "POST", token: s1.token });
  ok(
    "logout clears the cookie",
    out.status === 200 && out.setCookies.some((c) => c.startsWith(`${sessionCookieName()}=;`) && /Max-Age=0/.test(c))
  );
  ok("the old cookie is dead after logout", (await call("/api/v1/auth/me", { token: s1.token })).status === 401);
  ok(
    "logout without a session is harmless (200)",
    (await call("/api/v1/auth/logout", { method: "POST" })).status === 200
  );
  ok(
    "logout was audited",
    (await db.auditLog.count({ where: { organizationId: u.orgId, action: "auth.logout" } })) >= 1
  );

  // expiry strategy: sliding idle window with an absolute cap
  const sl = await loginAs(u.email);
  const slRow = await db.session.findFirstOrThrow({
    where: { userId: u.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  await db.session.update({
    where: { id: slRow.id },
    data: { lastSeenAt: new Date(Date.now() - 10 * 60_000), expiresAt: new Date(Date.now() + 3_600_000) },
  });
  await call("/api/v1/auth/me", { token: sl.token });
  const renewed = await db.session.findUniqueOrThrow({ where: { id: slRow.id } });
  ok("activity slides the idle expiry forward (~8h)", renewed.expiresAt.getTime() > Date.now() + 7 * 3_600_000);
  await db.session.update({
    where: { id: slRow.id },
    data: {
      createdAt: new Date(Date.now() - (14 * 24 - 1) * 3_600_000),
      lastSeenAt: new Date(Date.now() - 10 * 60_000),
    },
  });
  await call("/api/v1/auth/me", { token: sl.token });
  const capped = await db.session.findUniqueOrThrow({ where: { id: slRow.id } });
  ok(
    "sliding renewal never passes the 14-day absolute cap",
    capped.expiresAt.getTime() <= capped.createdAt.getTime() + 14 * 24 * 3_600_000 + 1000
  );
  await db.session.update({
    where: { id: slRow.id },
    data: { createdAt: new Date(Date.now() - 15 * 24 * 3_600_000), expiresAt: new Date(Date.now() + 3_600_000) },
  });
  ok(
    "a session older than 14 days is dead even if activity kept it alive",
    (await call("/api/v1/auth/me", { token: sl.token })).status === 401
  );

  // ═══════════════════════ PASSWORD RESET & CHANGE ═══════════════════════
  const p = await registerVerified("pw");
  const pOld = await loginAs(p.email);
  const beforeForgot = mailCount();
  const forgotKnown = await call("/api/v1/auth/password/forgot", {
    method: "POST",
    body: { email: p.email },
    ip: nextIp(),
  });
  const ghost = `ghost2-${suffix}@example.com`;
  const forgotUnknown = await call("/api/v1/auth/password/forgot", {
    method: "POST",
    body: { email: ghost },
    ip: nextIp(),
  });
  ok(
    "forgot-password answers identically for known and unknown emails",
    forgotKnown.status === 202 && JSON.stringify(forgotKnown.json) === JSON.stringify(forgotUnknown.json)
  );
  const resetMail = await waitForMail(p.email, "Reset your password", beforeForgot);
  ok("a reset email is sent to the real account", !!resetMail && /30 minutes/.test(resetMail.text));
  await sleep(1200);
  ok(
    "no email is sent for an unknown address",
    !readOutbox()
      .slice(beforeForgot)
      .some((m) => m.to === ghost)
  );
  const resetToken = tokenFrom(resetMail!);
  secretsSeen.add(resetToken);
  ok(
    "only a hash of the reset token is stored",
    (await db.authToken.findFirst({ where: { userId: p.user.id, purpose: "PASSWORD_RESET" } }))?.tokenHash ===
      sha256(resetToken)
  );

  const weakReset = await call("/api/v1/auth/password/reset", {
    method: "POST",
    body: { token: resetToken, password: "12345678" },
    ip: nextIp(),
  });
  ok("a weak new password is rejected", weakReset.status === 400 && weakReset.json.code === "weak_password");
  ok(
    "...and the one-time token is NOT burned by that mistake",
    (await db.authToken.findFirst({ where: { userId: p.user.id, purpose: "PASSWORD_RESET" } }))?.consumedAt === null
  );
  ok(
    "a bogus reset token -> 400",
    (
      await call("/api/v1/auth/password/reset", {
        method: "POST",
        body: { token: "y".repeat(43), password: NEW_PASSWORD },
        ip: nextIp(),
      })
    ).status === 400
  );
  const beforeChanged = mailCount();
  const goodReset = await call("/api/v1/auth/password/reset", {
    method: "POST",
    body: { token: resetToken, password: NEW_PASSWORD },
    ip: nextIp(),
  });
  ok("reset with a strong password succeeds", goodReset.status === 200);
  ok(
    "the reset token cannot be reused",
    (
      await call("/api/v1/auth/password/reset", {
        method: "POST",
        body: { token: resetToken, password: NEW_PASSWORD + "x" },
        ip: nextIp(),
      })
    ).status === 400
  );
  ok(
    "every existing session is signed out by a reset",
    (await call("/api/v1/auth/me", { token: pOld.token })).status === 401
  );
  ok(
    "the old password no longer works",
    (await call("/api/v1/auth/login", { method: "POST", body: { email: p.email, password: PASSWORD }, ip: nextIp() }))
      .status === 401
  );
  const pNew = await loginAs(p.email, NEW_PASSWORD);
  ok("the new password works", !!pNew.token);
  ok(
    "a 'your password was changed' notice is emailed",
    !!(await waitForMail(p.email, "password was changed", beforeChanged))
  );
  const exp = await registerVerified("pwexp");
  const beforeExp = mailCount();
  await call("/api/v1/auth/password/forgot", { method: "POST", body: { email: exp.email }, ip: nextIp() });
  const expToken = tokenFrom((await waitForMail(exp.email, "Reset your password", beforeExp))!);
  await db.authToken.updateMany({
    where: { userId: exp.user.id, purpose: "PASSWORD_RESET" },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  ok(
    "an expired reset token is refused",
    (
      await call("/api/v1/auth/password/reset", {
        method: "POST",
        body: { token: expToken, password: NEW_PASSWORD },
        ip: nextIp(),
      })
    ).status === 400
  );
  const fSeq: number[] = [];
  for (let i = 0; i < 4; i++)
    fSeq.push(
      (
        await call("/api/v1/auth/password/forgot", {
          method: "POST",
          body: { email: `flood-forgot-${suffix}@example.com` },
          ip: nextIp(),
        })
      ).status
    );
  ok(
    "forgot-password is limited per email (4th request in an hour -> 429)",
    fSeq.slice(0, 3).every((s) => s === 202) && fSeq[3] === 429,
    fSeq.join(",")
  );

  // authenticated password change
  const c1 = await loginAs(p.email, NEW_PASSWORD);
  const c2 = await loginAs(p.email, NEW_PASSWORD);
  const beforeChange = await call("/api/v1/auth/password/change", {
    method: "POST",
    token: c1.token,
    body: { currentPassword: "not-my-password-1", newPassword: PASSWORD },
  });
  ok(
    "changing the password requires the CURRENT password",
    beforeChange.status === 400 && beforeChange.json.code === "invalid_current_password"
  );
  ok(
    "the new password must differ",
    (
      await call("/api/v1/auth/password/change", {
        method: "POST",
        token: c1.token,
        body: { currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD },
      })
    ).json.code === "password_unchanged"
  );
  ok(
    "the new password must pass the policy",
    (
      await call("/api/v1/auth/password/change", {
        method: "POST",
        token: c1.token,
        body: { currentPassword: NEW_PASSWORD, newPassword: "short" },
      })
    ).json.code === "weak_password"
  );
  ok(
    "change-password requires a session",
    (await call("/api/v1/auth/password/change", { method: "POST", body: { currentPassword: "a", newPassword: "b" } }))
      .status === 401
  );
  const changed = await call("/api/v1/auth/password/change", {
    method: "POST",
    token: c1.token,
    body: { currentPassword: NEW_PASSWORD, newPassword: PASSWORD },
  });
  ok(
    "a valid change succeeds and reports revoked sessions",
    changed.status === 200 && changed.json.otherSessionsRevoked >= 1
  );
  ok(
    "the caller stays signed in; other sessions are signed out",
    (await call("/api/v1/auth/me", { token: c1.token })).status === 200 &&
      (await call("/api/v1/auth/me", { token: c2.token })).status === 401
  );

  // ═══════════════════════ INVITATIONS ═══════════════════════
  const ownerLogin = await loginAs(ownerEmail);
  const orgX = verifiedUser.organizationId;
  const rolesX = Object.fromEntries(
    (await db.role.findMany({ where: { organizationId: orgX } })).map((r) => [r.key, r])
  );
  const other = await registerVerified("orgy");
  const otherLogin = await loginAs(other.email);
  const rolesY = Object.fromEntries(
    (await db.role.findMany({ where: { organizationId: other.orgId } })).map((r) => [r.key, r])
  );

  ok(
    "inviting requires a session",
    (
      await call("/api/v1/auth/invitations", {
        method: "POST",
        body: { email: `x-${suffix}@example.com`, roleId: rolesX.salesperson.id },
      })
    ).status === 401
  );
  const invEmail = `sales-${suffix}@example.com`;
  const beforeInv = mailCount();
  const inv = await call("/api/v1/auth/invitations", {
    method: "POST",
    token: ownerLogin.token,
    body: { email: invEmail, roleId: rolesX.salesperson.id },
  });
  ok(
    "an owner can invite a salesperson (201)",
    inv.status === 201 && inv.json.role.key === "salesperson" && inv.json.status === "pending"
  );
  ok("the invitation DTO exposes no token or hash", !/token/i.test(JSON.stringify(inv.json)));
  const invMail = await waitForMail(invEmail, "invited you", beforeInv);
  ok("the invitee receives a link", !!invMail && invMail.text.includes("/accept-invitation?token="));
  const invToken = tokenFrom(invMail!);
  secretsSeen.add(invToken);
  ok(
    "only a hash of the invitation token is stored",
    (await db.invitation.findUniqueOrThrow({ where: { id: inv.json.id } })).tokenHash === sha256(invToken)
  );
  ok(
    "an invitation with another organization's role -> 404",
    (
      await call("/api/v1/auth/invitations", {
        method: "POST",
        token: ownerLogin.token,
        body: { email: `z-${suffix}@example.com`, roleId: rolesY.dealerOwner.id },
      })
    ).status === 404
  );
  ok(
    "inviting an existing member of your own organization -> 409",
    (
      await call("/api/v1/auth/invitations", {
        method: "POST",
        token: ownerLogin.token,
        body: { email: ownerEmail, roleId: rolesX.viewer.id },
      })
    ).status === 409
  );
  const beforeElsewhere = mailCount();
  const elsewhere = await call("/api/v1/auth/invitations", {
    method: "POST",
    token: ownerLogin.token,
    body: { email: other.email, roleId: rolesX.viewer.id },
  });
  ok(
    "inviting an address registered in ANOTHER organization looks exactly like a normal invite",
    elsewhere.status === 201 && Object.keys(elsewhere.json).sort().join() === Object.keys(inv.json).sort().join()
  );
  const elsewhereMail = await waitForMail(other.email, "already have an account", beforeElsewhere);
  ok(
    "...but that person is emailed a notice, never an invite link into your organization",
    !!elsewhereMail && !elsewhereMail.text.includes("accept-invitation")
  );
  const listedX = await call("/api/v1/auth/invitations", { token: ownerLogin.token });
  ok(
    "the invitation list shows only this organization's pending invites",
    listedX.status === 200 && listedX.json.length === 2
  );
  const foreignInv = await call("/api/v1/auth/invitations", {
    method: "POST",
    token: otherLogin.token,
    body: { email: `foreign-${suffix}@example.com`, roleId: rolesY.viewer.id },
  });
  ok(
    "another organization cannot revoke my invitation (404)",
    (await call(`/api/v1/auth/invitations/${inv.json.id}`, { method: "DELETE", token: otherLogin.token })).status ===
      404
  );
  ok(
    "...and cannot see it in its list",
    (await call("/api/v1/auth/invitations", { token: otherLogin.token })).json.every(
      (i: { id: string }) => i.id === foreignInv.json.id
    )
  );

  const acceptWeak = await call("/api/v1/auth/invitations/accept", {
    method: "POST",
    body: { token: invToken, name: "Sam Sales", password: "12345678" },
    ip: nextIp(),
  });
  ok(
    "accepting with a weak password is rejected",
    acceptWeak.status === 400 && acceptWeak.json.code === "weak_password"
  );
  ok(
    "accepting with a bogus token -> 400",
    (
      await call("/api/v1/auth/invitations/accept", {
        method: "POST",
        body: { token: "z".repeat(43), name: "Sam Sales", password: PASSWORD },
        ip: nextIp(),
      })
    ).status === 400
  );
  ok(
    "accept rejects a client-supplied organization",
    (
      await call("/api/v1/auth/invitations/accept", {
        method: "POST",
        body: { token: invToken, name: "Sam Sales", password: PASSWORD, organizationId: other.orgId },
        ip: nextIp(),
      })
    ).json.code === "tenant_field_not_allowed"
  );
  const accepted = await call("/api/v1/auth/invitations/accept", {
    method: "POST",
    body: { token: invToken, name: "Sam Sales", password: PASSWORD },
    ip: nextIp(),
  });
  ok("accepting creates the account and signs in (201 + cookie)", accepted.status === 201 && !!cookieToken(accepted));
  const salesUser = await db.user.findUniqueOrThrow({ where: { email: invEmail }, include: { role: true } });
  ok(
    "the new user is in the INVITING organization with the invited role, ACTIVE and verified",
    salesUser.organizationId === orgX &&
      salesUser.role.key === "salesperson" &&
      salesUser.status === "ACTIVE" &&
      salesUser.emailVerifiedAt !== null
  );
  ok(
    "the session belongs to the inviting organization",
    (await call("/api/v1/auth/me", { token: cookieToken(accepted)! })).json.organization.id === orgX
  );
  ok(
    "an invitation cannot be accepted twice",
    (
      await call("/api/v1/auth/invitations/accept", {
        method: "POST",
        body: { token: invToken, name: "Sam Sales", password: PASSWORD },
        ip: nextIp(),
      })
    ).status === 400
  );

  const salesLogin = await loginAs(invEmail);
  ok(
    "a salesperson cannot invite anyone (403)",
    (
      await call("/api/v1/auth/invitations", {
        method: "POST",
        token: salesLogin.token,
        body: { email: `n-${suffix}@example.com`, roleId: rolesX.viewer.id },
      })
    ).status === 403
  );

  // role-rank rule: managers hold users:create by default (team management), but cannot invite an owner
  const mgrEmail = `mgr-${suffix}@example.com`;
  const beforeMgr = mailCount();
  await call("/api/v1/auth/invitations", {
    method: "POST",
    token: ownerLogin.token,
    body: { email: mgrEmail, roleId: rolesX.manager.id },
  });
  const mgrToken = tokenFrom((await waitForMail(mgrEmail, "invited you", beforeMgr))!);
  await call("/api/v1/auth/invitations/accept", {
    method: "POST",
    body: { token: mgrToken, name: "Mia Manager", password: PASSWORD },
    ip: nextIp(),
  });
  const mgrLogin = await loginAs(mgrEmail);
  const rankTry = await call("/api/v1/auth/invitations", {
    method: "POST",
    token: mgrLogin.token,
    body: { email: `boss-${suffix}@example.com`, roleId: rolesX.dealerOwner.id },
  });
  ok(
    "a manager cannot invite someone to a role above their own",
    rankTry.status === 403 && rankTry.json.code === "role_rank_exceeded"
  );
  ok(
    "a manager CAN invite at or below their own rank",
    (
      await call("/api/v1/auth/invitations", {
        method: "POST",
        token: mgrLogin.token,
        body: { email: `viewer-${suffix}@example.com`, roleId: rolesX.viewer.id },
      })
    ).status === 201
  );

  // revoke / expire / replace / concurrent accept
  const rEmail = `revoked-${suffix}@example.com`;
  const beforeR = mailCount();
  const rInv = await call("/api/v1/auth/invitations", {
    method: "POST",
    token: ownerLogin.token,
    body: { email: rEmail, roleId: rolesX.viewer.id },
  });
  const rToken = tokenFrom((await waitForMail(rEmail, "invited you", beforeR))!);
  ok(
    "an invitation can be revoked",
    (await call(`/api/v1/auth/invitations/${rInv.json.id}`, { method: "DELETE", token: ownerLogin.token })).status ===
      200
  );
  ok(
    "a revoked invitation cannot be accepted",
    (
      await call("/api/v1/auth/invitations/accept", {
        method: "POST",
        body: { token: rToken, name: "Rev Oked", password: PASSWORD },
        ip: nextIp(),
      })
    ).status === 400
  );
  const xEmail = `expired-${suffix}@example.com`;
  const beforeX = mailCount();
  const xInv = await call("/api/v1/auth/invitations", {
    method: "POST",
    token: ownerLogin.token,
    body: { email: xEmail, roleId: rolesX.viewer.id },
  });
  const xToken = tokenFrom((await waitForMail(xEmail, "invited you", beforeX))!);
  await db.invitation.update({ where: { id: xInv.json.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  ok(
    "an expired invitation cannot be accepted",
    (
      await call("/api/v1/auth/invitations/accept", {
        method: "POST",
        body: { token: xToken, name: "Ex Pired", password: PASSWORD },
        ip: nextIp(),
      })
    ).status === 400
  );
  const dEmail = `replace-${suffix}@example.com`;
  const beforeD1 = mailCount();
  await call("/api/v1/auth/invitations", {
    method: "POST",
    token: ownerLogin.token,
    body: { email: dEmail, roleId: rolesX.viewer.id },
  });
  const oldTok = tokenFrom((await waitForMail(dEmail, "invited you", beforeD1))!);
  const beforeD2 = mailCount();
  await call("/api/v1/auth/invitations", {
    method: "POST",
    token: ownerLogin.token,
    body: { email: dEmail, roleId: rolesX.viewer.id },
  });
  const newTok = tokenFrom((await waitForMail(dEmail, "invited you", beforeD2))!);
  ok(
    "re-inviting the same address replaces the earlier invitation",
    oldTok !== newTok &&
      (
        await call("/api/v1/auth/invitations/accept", {
          method: "POST",
          body: { token: oldTok, name: "Old Link", password: PASSWORD },
          ip: nextIp(),
        })
      ).status === 400
  );
  const race = await Promise.all(
    [1, 2].map(() =>
      call("/api/v1/auth/invitations/accept", {
        method: "POST",
        body: { token: newTok, name: "Race User", password: PASSWORD },
        ip: nextIp(),
      })
    )
  );
  ok(
    "two simultaneous accepts of one invitation: exactly one wins",
    race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 400).length === 1,
    race.map((r) => r.status).join(",")
  );
  ok("...and exactly one account exists", (await db.user.count({ where: { email: dEmail } })) === 1);

  // ═══════════════════════ ACCOUNT STATUS ═══════════════════════
  const st = (id: string, status: string, token: string) =>
    call(`/api/v1/users/${id}/status`, { method: "PATCH", token, body: { status } });
  ok(
    "changing status requires permission (salesperson -> 403)",
    (await st(salesUser.id, "suspended", salesLogin.token)).status === 403
  );
  ok(
    "you cannot change your own status",
    (await st(verifiedUser.id, "suspended", ownerLogin.token)).json.code === "cannot_change_own_status"
  );
  ok("a user of another organization -> 404", (await st(other.user.id, "suspended", ownerLogin.token)).status === 404);
  ok(
    "an unknown field is rejected",
    (
      await call(`/api/v1/users/${salesUser.id}/status`, {
        method: "PATCH",
        token: ownerLogin.token,
        body: { status: "suspended", role: "dealerOwner" },
      })
    ).status === 400
  );
  ok(
    "a manager cannot suspend the owner (outranked)",
    (await st(verifiedUser.id, "suspended", mgrLogin.token)).json.code === "role_rank_exceeded"
  );
  const target = await loginAs(invEmail);
  const suspend = await st(salesUser.id, "suspended", ownerLogin.token);
  ok("an owner can suspend a user", suspend.status === 200 && suspend.json.status === "suspended");
  ok(
    "suspension signs the user out IMMEDIATELY",
    (await call("/api/v1/auth/me", { token: target.token })).status === 401
  );
  const denied = await call("/api/v1/auth/login", {
    method: "POST",
    body: { email: invEmail, password: PASSWORD },
    ip: nextIp(),
  });
  ok(
    "a suspended user is told so only after the correct password",
    denied.status === 403 && denied.json.code === "account_suspended" && !cookieToken(denied)
  );
  ok(
    "...and a wrong password still gets the generic 401",
    (
      await call("/api/v1/auth/login", {
        method: "POST",
        body: { email: invEmail, password: "wrong-wrong-1" },
        ip: nextIp(),
      })
    ).status === 401
  );
  ok(
    "suspension was audited",
    (await db.auditLog.count({ where: { organizationId: orgX, action: "user.suspended", entityId: salesUser.id } })) ===
      1
  );
  ok(
    "re-activating works",
    (await st(salesUser.id, "active", ownerLogin.token)).status === 200 && !!(await loginAs(invEmail)).token
  );
  const pending = await db.user.create({
    data: {
      organizationId: orgX,
      roleId: rolesX.viewer.id,
      name: "Pending Pat",
      email: `pending-${suffix}@example.com`,
      status: "PENDING_VERIFICATION",
    },
  });
  ok(
    "an admin cannot activate a pending account (must verify email)",
    (await st(pending.id, "active", ownerLogin.token)).json.code === "invalid_status_transition"
  );

  const suspOrg = await registerVerified("susporg");
  await db.organization.update({ where: { id: suspOrg.orgId }, data: { status: "SUSPENDED" } });
  const so = await call("/api/v1/auth/login", {
    method: "POST",
    body: { email: suspOrg.email, password: PASSWORD },
    ip: nextIp(),
  });
  ok(
    "a member of a suspended organization gets organization_suspended after the right password",
    so.status === 403 && so.json.code === "organization_suspended"
  );

  // ═══════════════════════ SECRETS, AUDIT & STORAGE HYGIENE ═══════════════════════
  const everything = allBodies.join("\n");
  ok(
    "no password hash or hash column ever appears in any API response",
    !/\$argon2|passwordHash|password_hash|tokenHash|token_hash/i.test(everything)
  );
  ok(
    "no plaintext password ever appears in any API response",
    !everything.includes(PASSWORD) && !everything.includes(NEW_PASSWORD)
  );
  ok(
    "no emailed one-time token or session token ever appears in any API response",
    [...secretsSeen].every((t) => !everything.includes(t))
  );
  const auditText = JSON.stringify(
    await db.auditLog.findMany({
      where: { organizationId: { in: [orgX, other.orgId, p.orgId, u.orgId] } },
      select: { metadata: true, action: true, userAgent: true },
    })
  );
  ok(
    "audit metadata never contains passwords, hashes or tokens",
    !/argon2|"password":|passwordHash/i.test(auditText) && [...secretsSeen].every((t) => !auditText.includes(t))
  );
  ok(
    "authentication events are audited (success, failure, logout, reset)",
    (await db.auditLog.count({ where: { action: "auth.login", outcome: "FAILURE" } })) > 0 &&
      (await db.auditLog.count({ where: { action: "auth.login", outcome: "SUCCESS" } })) > 0 &&
      (await db.auditLog.count({ where: { action: "auth.password_reset" } })) > 0
  );
  const buckets = await db.rateLimitBucket.findMany({ select: { key: true } });
  ok(
    "rate-limit storage holds only opaque hashes (no emails or IPs)",
    buckets.length > 0 && buckets.every((b) => /^[0-9a-f]{64}$/.test(b.key))
  );
  const cache = await call("/api/v1/auth/sessions", { token: ownerLogin.token });
  ok("auth responses are marked no-store", cache.headers.get("cache-control") === "no-store");

  if (process.env.DATABASE_URL) {
    const app = createPrismaClient(process.env.DATABASE_URL, { maxConnections: 1 });
    let denied2 = false;
    try {
      await app.$queryRaw`SELECT 1 FROM rate_limit_buckets LIMIT 1`;
    } catch (e) {
      denied2 = /permission denied/i.test(
        String((e as Error).message) + String((e as { cause?: unknown }).cause ?? "")
      );
    }
    await app.$disconnect();
    ok("the runtime database role cannot read the rate-limit table", denied2);
  }
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nAuth HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Auth HTTP check OK: ${passed} assertions passed.`);
  });
