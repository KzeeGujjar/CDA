/**
 * Unit checks for the security-critical pure logic (no database, no server): password hashing and
 * policy, one-time tokens, cookie attributes, production configuration guards, and email escaping.
 * Run with `npm run check:auth-unit`.
 */
import { hash } from "@node-rs/argon2";
import {
  hashPassword,
  needsRehash,
  passwordPolicyProblems,
  verifyAgainstDummy,
  verifyPassword,
} from "@/server/auth/password";
import { generateToken, hashToken, looksLikeToken } from "@/server/auth/tokens";
import { hashSessionToken, generateSessionToken } from "@/server/auth/session";
import { serializeClearedSessionCookie, serializeSessionCookie, sessionCookieName } from "@/server/auth/cookies";
import { emailConfig } from "@/server/env";
import { describeDevice } from "@/server/auth/flows/common";
import { invitationMessage, passwordResetMessage } from "@/server/email/templates";

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const env = process.env as Record<string, string | undefined>;
const withEnv = <T>(vars: Record<string, string | undefined>, fn: () => T): T => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = env[k];
    if (vars[k] === undefined) delete env[k];
    else env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
  }
};

async function main() {
  // ── password hashing
  const password = "Tr1cky-Horse-Battery-Staple";
  const h1 = await hashPassword(password);
  const h2 = await hashPassword(password);
  ok("hash is Argon2id", h1.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"), h1.slice(0, 40));
  ok("plaintext is not contained in the hash", !h1.includes(password) && !h1.includes("Tr1cky"));
  ok("same password -> different hashes (random salt)", h1 !== h2);
  ok("correct password verifies", await verifyPassword(h1, password));
  ok("wrong password fails", !(await verifyPassword(h1, password + "x")));
  ok("empty password fails", !(await verifyPassword(h1, "")));
  ok("malformed hash fails closed (no throw)", !(await verifyPassword("not-a-hash", password)));
  ok("a fresh hash does not need a rehash", !needsRehash(h1));
  const weak = await hash(password, { memoryCost: 4096, timeCost: 1, parallelism: 1, algorithm: 2 });
  ok("a hash with weaker parameters is flagged for upgrade", needsRehash(weak));
  ok("a non-argon2id hash is flagged for upgrade", needsRehash("$2b$10$abcdefghijklmnopqrstuv"));
  const t0 = Date.now();
  await verifyAgainstDummy("anything");
  const dummyMs = Date.now() - t0;
  const t1 = Date.now();
  await verifyPassword(h1, "anything");
  const realMs = Date.now() - t1;
  ok(
    "dummy verification costs about as much as a real one (timing equalisation)",
    dummyMs > 0 && Math.abs(dummyMs - realMs) < 200,
    `${dummyMs}ms vs ${realMs}ms`
  );

  // ── password policy
  const strong = passwordPolicyProblems(password, { email: "sam@example.com", name: "Sam Carter" });
  ok("a strong password passes", strong.length === 0, strong.join("; "));
  ok("too short is rejected", passwordPolicyProblems("Ab1!xyz").length > 0);
  ok("too long is rejected (hashing DoS guard)", passwordPolicyProblems("a1B!".repeat(40)).length > 0);
  ok("common password is rejected", passwordPolicyProblems("password123").length > 0);
  ok("common password is rejected regardless of case", passwordPolicyProblems("PassWord123").length > 0);
  ok("single repeated character is rejected", passwordPolicyProblems("aaaaaaaaaaaa").length > 0);
  ok(
    "password containing the email name is rejected",
    passwordPolicyProblems("samuel.carter-2026!", { email: "samuel.carter@example.com" }).length > 0
  );
  ok(
    "password containing the user's name is rejected",
    passwordPolicyProblems("MyNameIsSamCarter!", { name: "Sam Carter" }).length > 0
  );
  ok("a passphrase with spaces is accepted", passwordPolicyProblems("correct horse battery staple").length === 0);

  // ── one-time tokens
  const t = generateToken();
  ok("token has 256 bits of entropy (43 base64url chars)", t.length === 43 && looksLikeToken(t));
  ok("tokens are unique", new Set(Array.from({ length: 200 }, generateToken)).size === 200);
  ok("token hash is SHA-256 hex and differs from the token", /^[0-9a-f]{64}$/.test(hashToken(t)) && hashToken(t) !== t);
  ok("token hash is deterministic", hashToken(t) === hashToken(t));
  ok(
    "junk is not accepted as a token",
    !looksLikeToken("short") &&
      !looksLikeToken("x".repeat(500)) &&
      !looksLikeToken("a b".repeat(20)) &&
      !looksLikeToken(undefined)
  );
  const s = generateSessionToken();
  ok("session token is stored only as a hash", hashSessionToken(s) !== s && /^[0-9a-f]{64}$/.test(hashSessionToken(s)));

  // ── cookies
  withEnv({ COOKIE_SECURE: "false" }, () => {
    const c = serializeSessionCookie("tok");
    ok(
      "dev cookie is HttpOnly + SameSite=Lax + Path=/ + Max-Age",
      /HttpOnly/.test(c) && /SameSite=Lax/.test(c) && /Path=\//.test(c) && /Max-Age=1209600/.test(c),
      c
    );
    ok("dev cookie has no Domain attribute", !/Domain=/i.test(c));
    ok("dev cookie name has no __Host- prefix", sessionCookieName() === "cda_session");
  });
  withEnv({ COOKIE_SECURE: "true" }, () => {
    const c = serializeSessionCookie("tok");
    ok(
      "secure cookie carries Secure and the __Host- prefix",
      /; Secure/.test(c) && c.startsWith("__Host-cda_session="),
      c
    );
    ok("secure cookie has Path=/ and no Domain (required by __Host-)", /Path=\//.test(c) && !/Domain=/i.test(c));
    ok("cleared cookie expires immediately", /Max-Age=0/.test(serializeClearedSessionCookie()));
  });
  withEnv({ NODE_ENV: "production", COOKIE_SECURE: undefined }, () => {
    ok("cookies are Secure by default in production", /; Secure/.test(serializeSessionCookie("tok")));
  });

  // ── configuration guards
  const throws = (fn: () => unknown) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  ok(
    "log email transport is refused in production",
    throws(() => withEnv({ NODE_ENV: "production", EMAIL_TRANSPORT: "log" }, emailConfig))
  );
  ok(
    "default transport in production needs a Resend key",
    throws(() =>
      withEnv({ NODE_ENV: "production", EMAIL_TRANSPORT: undefined, RESEND_API_KEY: undefined }, emailConfig)
    )
  );
  ok(
    "file transport is refused in production without the explicit opt-in",
    throws(() =>
      withEnv(
        {
          NODE_ENV: "production",
          EMAIL_TRANSPORT: "file",
          EMAIL_OUTBOX_FILE: "x",
          EMAIL_ALLOW_FILE_TRANSPORT: undefined,
        },
        emailConfig
      )
    )
  );
  ok(
    "file transport works with the opt-in",
    !throws(() =>
      withEnv(
        { NODE_ENV: "production", EMAIL_TRANSPORT: "file", EMAIL_OUTBOX_FILE: "x", EMAIL_ALLOW_FILE_TRANSPORT: "1" },
        emailConfig
      )
    )
  );
  ok(
    "resend transport works with a key",
    !throws(() => withEnv({ NODE_ENV: "production", EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x" }, emailConfig))
  );
  ok(
    "unknown transport is refused",
    throws(() => withEnv({ EMAIL_TRANSPORT: "smtp" }, emailConfig))
  );

  // ── emails
  withEnv({ APP_URL: "https://app.example.com/" }, () => {
    const evil = `<img src=x onerror=alert(1)>`;
    const m = invitationMessage("a@b.co", evil, evil, evil, "TOKEN_abc-123");
    ok("HTML in names is escaped in the email body", !m.html.includes("<img") && m.html.includes("&lt;img"));
    ok(
      "invitation link points at the configured app URL with the token",
      m.text.includes("https://app.example.com/accept-invitation?token=TOKEN_abc-123")
    );
    const r = passwordResetMessage("a@b.co", "A", "TOK");
    ok("reset email states the 30 minute lifetime", /30 minutes/.test(r.text));
  });

  ok(
    "device label from a Chrome/Windows user agent",
    describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36") === "Chrome on Windows"
  );
  ok("device label is safe for a missing user agent", describeDevice(undefined) === "Unknown device");
}

main()
  .catch((e) => failures.push(`unexpected error: ${(e as Error).stack ?? e}`))
  .finally(() => {
    if (failures.length) {
      console.error(
        `Auth unit check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Auth unit check OK: ${passed} assertions passed.`);
  });
