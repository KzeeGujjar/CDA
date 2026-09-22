import { hash, verify } from "@node-rs/argon2";
import { passwordBreachCheckEnabled } from "@/server/env";
import { createHash } from "node:crypto";

/**
 * Passwords are hashed with Argon2id (OWASP-recommended parameters: 19 MiB, 2 iterations, 1 lane) and a
 * per-password random salt; the encoded string carries its own parameters, so they can be raised later
 * and old hashes upgraded transparently on the next successful login (see needsRehash).
 * Plaintext passwords are never stored, logged or returned.
 */
const PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 2 /* Argon2id */ } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

export async function verifyPassword(encodedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(encodedHash, password);
  } catch {
    return false; // malformed hash
  }
}

/** True when a stored hash was made with weaker parameters than the current ones. */
export function needsRehash(encodedHash: string): boolean {
  const match = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(encodedHash);
  if (!match) return true;
  return (
    Number(match[1]) < PARAMS.memoryCost || Number(match[2]) < PARAMS.timeCost || Number(match[3]) < PARAMS.parallelism
  );
}

let dummyHash: Promise<string> | undefined;
/**
 * Burns the same CPU as a real check. Used when the email does not exist so response time does not
 * reveal whether an account is registered.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalisation");
  await verifyPassword(await dummyHash, password);
}

// ───────────────────────── password policy ─────────────────────────

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128; // bounds hashing cost (denial-of-service guard)

const COMMON_PASSWORDS = new Set(
  [
    "password",
    "password1",
    "password123",
    "passw0rd",
    "123456",
    "1234567",
    "12345678",
    "123456789",
    "1234567890",
    "12345678910",
    "qwerty",
    "qwerty123",
    "qwertyuiop",
    "abc123",
    "111111",
    "000000",
    "iloveyou",
    "admin",
    "administrator",
    "welcome",
    "welcome1",
    "letmein",
    "monkey",
    "dragon",
    "football",
    "baseball",
    "master",
    "login",
    "princess",
    "sunshine",
    "shadow",
    "superman",
    "trustno1",
    "changeme",
    "default",
    "guest",
    "secret",
    "test1234",
    "car dealer",
    "cardealer",
    "dealership",
    "emirates",
    "dubai123",
    "abudhabi",
    "uae12345",
  ].map((p) => p.toLowerCase())
);

export interface PasswordContext {
  email?: string;
  name?: string;
}

/** Returns human-readable problems; empty array = acceptable. Synchronous local rules only. */
export function passwordPolicyProblems(password: string, context: PasswordContext = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) problems.push("This password is too common.");
  if (/^(.)\1+$/.test(password)) problems.push("Do not repeat a single character.");
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push("Do not include your email address.");
  const name = context.name?.toLowerCase().replace(/\s+/g, "");
  if (name && name.length >= 4 && lower.replace(/\s+/g, "").includes(name)) problems.push("Do not include your name.");
  return problems;
}

/**
 * Optional breached-password check against Have I Been Pwned using k-anonymity: only the first 5 hex
 * characters of the SHA-1 leave this server, never the password or full hash. Fails OPEN (a network
 * problem must not block sign-up).
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (!passwordBreachCheckEnabled()) return false;
  try {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [candidate, count] = line.trim().split(":");
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

export async function assertAcceptablePassword(password: string, context: PasswordContext = {}): Promise<string[]> {
  const problems = passwordPolicyProblems(password, context);
  if (problems.length === 0 && (await isBreachedPassword(password))) {
    problems.push("This password appears in known data breaches. Choose a different one.");
  }
  return problems;
}
