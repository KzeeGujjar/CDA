import { configuredSecrets, type ProviderId } from "../config";
import { AiProviderError, type AiErrorKind } from "./types";

/** Removes any configured API key (and anything shaped like one) from text before it reaches a log. */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const secret of configuredSecrets()) {
    if (secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g, "Bearer [redacted]");
}

function kindForStatus(status: number): { kind: AiErrorKind; retryable: boolean } {
  if (status === 401 || status === 403) return { kind: "auth", retryable: false };
  if (status === 429) return { kind: "rate_limit", retryable: true };
  if (status === 408 || status === 504) return { kind: "timeout", retryable: true };
  if (status === 529 || status === 503) return { kind: "overloaded", retryable: true };
  if (status >= 500) return { kind: "unavailable", retryable: true };
  return { kind: "invalid_request", retryable: false };
}

/**
 * POSTs JSON and returns the parsed response. Every failure becomes an AiProviderError with no secret in it:
 * a non-2xx status is classified, a network error or timeout is classified, a non-JSON body is "bad_response".
 * The provider's own error text is kept only as a short scrubbed `detail` for the server log.
 */
export async function postJson(
  provider: ProviderId,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<{ json: unknown; requestId?: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error", // a provider must never bounce our credentials to another host
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") throw new AiProviderError(provider, "timeout", true);
    throw new AiProviderError(
      provider,
      "unavailable",
      true,
      undefined,
      scrubSecrets(String((error as Error).message)).slice(0, 200)
    );
  }
  const requestId = response.headers.get("request-id") ?? response.headers.get("x-request-id") ?? undefined;
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const { kind, retryable } = kindForStatus(response.status);
    throw new AiProviderError(provider, kind, retryable, response.status, scrubSecrets(text).slice(0, 300));
  }
  try {
    return { json: JSON.parse(text), requestId };
  } catch {
    throw new AiProviderError(provider, "bad_response", false, response.status, "response was not JSON");
  }
}

export const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const asNumber = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
