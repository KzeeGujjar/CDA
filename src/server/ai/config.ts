/**
 * AI provider configuration. SERVER-ONLY.
 *
 * Every secret here is read from an ordinary server environment variable (ANTHROPIC_API_KEY, OPENAI_API_KEY,
 * GEMINI_API_KEY). None of them may ever start with NEXT_PUBLIC_: Next.js copies NEXT_PUBLIC_ variables into
 * the JavaScript sent to browsers. `npm run check:ai-secrets` scans the source and the built browser bundle
 * to make sure that never happens. The frontend never sees a key, a provider URL or a provider SDK: it only
 * calls our own /api/v1/ai/* endpoints.
 */

export const providerIds = ["anthropic", "openai", "google"] as const;
export type ProviderId = (typeof providerIds)[number];

export const providerLabels: Record<ProviderId, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
};

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ProviderEnvNames {
  key: string;
  baseUrl: string;
  model: string;
  defaultBaseUrl: string;
  /** null = the operator must choose the model explicitly (we do not guess model names). */
  defaultModel: string | null;
}

const ENV: Record<ProviderId, ProviderEnvNames> = {
  anthropic: {
    key: "ANTHROPIC_API_KEY",
    baseUrl: "ANTHROPIC_BASE_URL",
    model: "AI_MODEL_ANTHROPIC",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
  },
  openai: {
    key: "OPENAI_API_KEY",
    baseUrl: "OPENAI_BASE_URL",
    model: "AI_MODEL_OPENAI",
    defaultBaseUrl: "https://api.openai.com",
    defaultModel: null,
  },
  google: {
    key: "GEMINI_API_KEY",
    baseUrl: "GEMINI_BASE_URL",
    model: "AI_MODEL_GOOGLE",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: null,
  },
};

const isProduction = () => process.env.NODE_ENV === "production";

function validBaseUrl(name: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }
  if (isProduction() && url.protocol !== "https:") {
    // Test environments only: plain http for a loopback address (a local fake provider) with an explicit flag.
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (!(process.env.AI_ALLOW_INSECURE_URL === "1" && loopback))
      throw new Error(`${name} must use https in production.`);
  }
  return url.origin;
}

/**
 * The configuration of one provider, or null when it is not set up (no key, or no model where one must be
 * chosen). A provider that is not configured simply is not offered; nothing else is affected.
 */
export function providerConfig(id: ProviderId): ProviderConfig | null {
  const names = ENV[id];
  const apiKey = process.env[names.key]?.trim();
  const model = (process.env[names.model]?.trim() || names.defaultModel) ?? null;
  if (!apiKey || !model) return null;
  const baseUrl = validBaseUrl(names.baseUrl, process.env[names.baseUrl]?.trim() || names.defaultBaseUrl);
  return { id, apiKey, baseUrl, model };
}

export function configuredProviders(): ProviderId[] {
  return providerIds.filter((id) => {
    try {
      return providerConfig(id) !== null;
    } catch {
      return false; // a malformed base URL counts as "not usable", and is logged when the provider is first used
    }
  });
}

/** Provider used when neither the request nor the organization picks one. */
export function defaultProviderFromEnv(): ProviderId | null {
  const wanted = process.env.AI_DEFAULT_PROVIDER?.trim() as ProviderId | undefined;
  const available = configuredProviders();
  if (wanted && available.includes(wanted)) return wanted;
  return available[0] ?? null;
}

export function requestTimeoutMs(): number {
  const ms = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 60_000);
  return Number.isFinite(ms) && ms >= 1000 && ms <= 300_000 ? ms : 60_000;
}

/** Every configured key value, so error text can be scrubbed of them before it is logged. */
export function configuredSecrets(): string[] {
  return providerIds.map((id) => process.env[ENV[id].key]?.trim()).filter((v): v is string => !!v);
}
