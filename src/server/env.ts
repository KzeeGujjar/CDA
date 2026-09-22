import { z } from "zod";

/**
 * Server-only configuration. None of these names start with NEXT_PUBLIC_, so Next.js never inlines
 * them into browser code; the frontend cannot import this module (ESLint rule) either.
 */
const schema = z.object({
  /** Runtime connection as the RLS-restricted `cda_app` role (pooled). Serves all tenant queries. */
  DATABASE_URL: z.string().min(1),
  /** Owner-role connection. Used ONLY by the platform client (login/session lookup, provisioning). */
  DIRECT_DATABASE_URL: z.string().min(1),
});

export type ServerEnv = z.infer<typeof schema>;

/** The deployment has no database configured (the frontend-only demo). Answered as 503 backend_not_configured. */
export class ServerNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerNotConfiguredError";
  }
}

let cached: ServerEnv | undefined;

/** Validated lazily so `next build` and the frontend-only demo work without a database. */
export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new ServerNotConfiguredError(
        `Missing or invalid server environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`
      );
    }
    cached = parsed.data;
  }
  return cached;
}

const isProduction = () => process.env.NODE_ENV === "production";

/** Send cookies with Secure + the __Host- prefix. Defaults to true in production (set false only for local http testing). */
export function cookieSecure(): boolean {
  const v = process.env.COOKIE_SECURE;
  return v ? v === "true" : isProduction();
}

/** Public base URL used in emailed links, e.g. https://app.example.com (no trailing slash). */
export function appUrl(): string {
  const url = (process.env.APP_URL ?? (isProduction() ? "" : "http://localhost:3000")).replace(/\/+$/, "");
  if (!url) throw new Error("APP_URL must be set in production (used in emailed links).");
  return url;
}

/** Check new passwords against Have I Been Pwned (k-anonymity: only a 5-char hash prefix leaves the server). */
export function passwordBreachCheckEnabled(): boolean {
  const v = process.env.PASSWORD_BREACH_CHECK;
  return v ? v !== "off" : isProduction();
}

export interface EmailConfig {
  transport: "log" | "file" | "resend";
  from: string;
  resendApiKey?: string;
  outboxFile?: string;
}

export function emailConfig(): EmailConfig {
  const env = process.env;
  const transport = (env.EMAIL_TRANSPORT ?? (isProduction() ? "resend" : "log")) as EmailConfig["transport"];
  if (!["log", "file", "resend"].includes(transport)) throw new Error(`Unknown EMAIL_TRANSPORT "${transport}".`);
  // Dev-only transports print/write full login links, so they must never run in production by accident.
  if (isProduction() && transport === "log") throw new Error("EMAIL_TRANSPORT=log is not allowed in production.");
  if (isProduction() && transport === "file" && env.EMAIL_ALLOW_FILE_TRANSPORT !== "1") {
    throw new Error(
      "EMAIL_TRANSPORT=file in production requires EMAIL_ALLOW_FILE_TRANSPORT=1 (test environments only)."
    );
  }
  if (transport === "resend" && !env.RESEND_API_KEY)
    throw new Error("RESEND_API_KEY is required for EMAIL_TRANSPORT=resend.");
  if (transport === "file" && !env.EMAIL_OUTBOX_FILE)
    throw new Error("EMAIL_OUTBOX_FILE is required for EMAIL_TRANSPORT=file.");
  return {
    transport,
    from: env.EMAIL_FROM ?? "CDA <no-reply@localhost>",
    resendApiKey: env.RESEND_API_KEY,
    outboxFile: env.EMAIL_OUTBOX_FILE,
  };
}

export interface StorageConfig {
  /** Supabase project URL, e.g. https://abcd.supabase.co (no trailing slash, no /storage/v1). */
  url: string;
  /** The service-role key: full access to Storage. Server-only; never sent to a browser or logged. */
  serviceRoleKey: string;
}

/**
 * Supabase Storage credentials. Read lazily so the app (and `next build`) works without them; only the
 * file endpoints need them. In production the URL must be https.
 */
export function storageConfig(): StorageConfig {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use file storage.");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL.");
  }
  if (isProduction() && parsed.protocol !== "https:") {
    // Test environments only: plain http is tolerated for a loopback address (a local fake of the Storage API)
    // when STORAGE_ALLOW_INSECURE_URL=1. Never for a real host.
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    if (!(process.env.STORAGE_ALLOW_INSECURE_URL === "1" && loopback)) {
      throw new Error("SUPABASE_URL must use https in production.");
    }
  }
  return { url: `${parsed.origin}`, serviceRoleKey };
}
