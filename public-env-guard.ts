/**
 * Build-time guard for NEXT_PUBLIC_ variables, run when next.config.ts loads (dev, build and start).
 *
 * Next.js copies every NEXT_PUBLIC_ variable that any code references into the JavaScript sent to every browser.
 * So a secret pasted into one, the classic mistake being the Supabase service-role key in the "anon key" slot,
 * is published the moment anything reads it. This refuses to start with such a value present, whether or not
 * anything reads it yet. It reports variable NAMES only, never a value.
 *
 * It lives at the repository root (build configuration), not in src/, so it is never part of the app bundle.
 */
type Env = Record<string, string | undefined>;

/**
 * NEXT_PUBLIC_ variables that are meant to be public although their name contains "KEY". A Supabase anon or
 * publishable key can do only what the database's grants and RLS policies allow (on this schema: nothing).
 * Adding a name here is a security review, not a convenience.
 */
export const PUBLIC_KEY_NAMES = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
] as const;

const SECRETISH_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|SERVICE_ROLE|DATABASE_URL)/i;

/** The role a Supabase JWT carries ("anon", "service_role", ...), or null when it is not a JWT. */
function jwtRole(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return null;
  }
}

/** What is wrong with the NEXT_PUBLIC_ variables in `env`; an empty list means fine. */
export function publicEnvProblems(env: Env): string[] {
  const problems: string[] = [];
  const publicNames = Object.keys(env).filter((n) => n.startsWith("NEXT_PUBLIC_"));
  const allowed = new Set<string>(PUBLIC_KEY_NAMES);

  for (const name of publicNames) {
    if (SECRETISH_NAME.test(name) && !allowed.has(name)) {
      problems.push(`${name}: a NEXT_PUBLIC_ variable is sent to every browser; its name suggests a secret`);
    }
  }

  for (const name of PUBLIC_KEY_NAMES) {
    const value = env[name]?.trim();
    if (!value) continue;
    if (value.startsWith("sb_secret_")) {
      problems.push(`${name}: holds a Supabase secret key. Use the publishable/anon key here, never the secret one`);
    } else if (!value.startsWith("sb_publishable_")) {
      const role = jwtRole(value);
      if (role === null) problems.push(`${name}: is not a Supabase publishable key or anon-role JWT`);
      else if (role !== "anon")
        problems.push(`${name}: is a JWT for the role "${role}"; only the "anon" role may be public`);
    }
  }

  // A secret's value must never appear under a public name, whatever the names say.
  const secrets = Object.entries(env).filter(
    ([name, value]) => !name.startsWith("NEXT_PUBLIC_") && SECRETISH_NAME.test(name) && !!value && value.length >= 8
  );
  for (const name of publicNames) {
    const value = env[name];
    if (!value || value.length < 8) continue;
    const twin = secrets.find(([, secret]) => secret === value);
    if (twin) problems.push(`${name}: holds the same value as ${twin[0]}, which must stay on the server`);
  }
  return problems;
}

/** Throws (naming variables, never values) when a NEXT_PUBLIC_ variable is misconfigured. */
export function assertPublicEnv(env: Env): void {
  const problems = publicEnvProblems(env);
  if (problems.length) {
    throw new Error(`Refusing to start: unsafe NEXT_PUBLIC_ configuration.\n - ${problems.join("\n - ")}`);
  }
}
