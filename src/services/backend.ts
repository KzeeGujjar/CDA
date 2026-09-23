import type { ApiError } from "@/types/common";

/**
 * The one place the browser talks to the server-side API (`/api/v1/**`, same origin).
 * The session lives in an httpOnly cookie the browser sends by itself: no token, key or organization id is ever
 * handled here, and the server derives the dealership and permissions from the session alone.
 */
export type BackendResult<T> =
  { kind: "ok"; status: number; data: T } | { kind: "error"; error: ApiError } | { kind: "unavailable" };

interface FlatErrorBody {
  message?: string;
  code?: string;
  fieldErrors?: { path: string; message: string }[];
  requestId?: string;
}
interface V2Body {
  success: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; details?: { fieldErrors?: FlatErrorBody["fieldErrors"]; requestId?: string } };
}

export async function backendRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<BackendResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }
  let raw: FlatErrorBody | V2Body | null = null;
  try {
    const text = await response.text();
    raw = text ? JSON.parse(text) : null;
  } catch {
    // An HTML error page or an empty body: there is no API behind this address.
    return { kind: "unavailable" };
  }
  // Two response envelopes coexist server-side (§0.24: API Design) — endpoints built before it return their
  // fields directly, endpoints built from it onward wrap everything in {success, data|error}. Normalized
  // here so nothing downstream of backendRequest needs to know which one a given route uses.
  const isV2 = raw !== null && "success" in raw;
  const data = isV2 ? (raw as V2Body).data : raw;
  const err: FlatErrorBody | undefined = isV2
    ? {
        code: (raw as V2Body).error?.code,
        message: (raw as V2Body).error?.message,
        fieldErrors: (raw as V2Body).error?.details?.fieldErrors,
        requestId: (raw as V2Body).error?.details?.requestId,
      }
    : ((raw as FlatErrorBody | null) ?? undefined);

  if (response.ok) return { kind: "ok", status: response.status, data: data as T };
  if (response.status === 404 && !err?.code) return { kind: "unavailable" };
  const retryAfter = Number(response.headers.get("retry-after"));
  return {
    kind: "error",
    error: {
      message: err?.message ?? "The request failed.",
      code: err?.code,
      status: response.status,
      ...(err?.fieldErrors?.length ? { fieldErrors: err.fieldErrors } : {}),
      ...(err?.requestId ? { requestId: err.requestId } : {}),
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
    },
  };
}

/**
 * There is no backend behind this address (nothing answers, or the deployment has no database configured). Only
 * then may a service fall back to demo data: any other failure (a database outage, a bug) is a real error to show.
 */
export const isUnavailable = (result: BackendResult<unknown>) =>
  result.kind === "unavailable" || (result.kind === "error" && result.error.code === "backend_not_configured");

/**
 * PUTs a file straight to a signed upload URL — object storage, not our own `/api/v1` origin — that a service
 * obtained from the server (services/vehicleService.ts's photo upload flow). This is the one other place besides
 * backendRequest this app talks to the network from directly; every service still goes through this file rather
 * than calling fetch itself, so there is one place to audit (scripts/check-services.ts enforces it).
 */
export async function putSignedUpload(url: string, headers: Record<string, string>, file: File): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "PUT", headers, body: file });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * "live": a real session exists, so the AI agent talks to the server. "demo": there is none (or no backend at all),
 * so the built-in demo data keeps the app usable exactly as before. Decided once by asking the server who we are.
 */
let mode: Promise<"live" | "demo"> | null = null;

export function backendMode(): Promise<"live" | "demo"> {
  mode ??= backendRequest("GET", "/auth/me").then((result) => {
    if (result.kind === "ok") return "live";
    // A signed-in user whose database is down is still in live mode: the next call fails with a real, retryable
    // error instead of quietly showing sample data as if it were theirs.
    const code = result.kind === "error" ? result.error.code : undefined;
    return code === "database_unavailable" || code === "database_busy" ? "live" : "demo";
  });
  return mode;
}

/** Forget the decision (after signing in or out, or when the session turns out to have expired). */
export function resetBackendMode(): void {
  mode = null;
}

/**
 * The result of a backend call, or a thrown ApiError (the shape every call site already handles). A 401 or an
 * unreachable server forgets the live/demo decision, so the next call asks again.
 */
export function unwrapBackend<T>(result: BackendResult<T>): T {
  if (result.kind === "ok") return result.data;
  if (result.kind === "error") {
    if (result.error.status === 401) resetBackendMode();
    throw result.error;
  }
  resetBackendMode();
  const error: ApiError = { message: "The server could not be reached.", code: "unavailable" };
  throw error;
}

/**
 * How a service picks its data source. `live` talks to the backend as the signed-in user; `demo` is the built-in
 * sample data, used when nobody is signed in or the deployment has no backend. A service is "connected" when it
 * passes a `live` function; until its endpoints exist it passes only `demo` and behaves exactly as before.
 */
export async function liveOrDemo<T>(sources: { live: () => Promise<T>; demo: () => Promise<T> }): Promise<T> {
  return (await backendMode()) === "live" ? sources.live() : sources.demo();
}
