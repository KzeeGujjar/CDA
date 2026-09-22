import type { ApiError } from "@/types/common";

/**
 * One place that decides WHAT KIND of failure something is, so every screen, toast and retry rule treats it the same.
 * Pure (no React, no network), so it can be tested on its own.
 *
 *   validation       the user's input is wrong (400 / 422, and field errors)      fix the input, do not retry
 *   unauthenticated  no valid session (401)                                       sign in again
 *   forbidden        signed in, role not allowed (403)                            not retryable
 *   notFound         does not exist, or not visible to this user (404)
 *   conflict         clashes with existing data or a rule (409)                   refresh and retry
 *   rateLimited      too many requests (429)                                      retry after a wait
 *   database         the database is unavailable or busy (503 database_*)         retry
 *   server           the server failed (5xx)                                      retry
 *   network          the server could not be reached                              retry
 *   unknown          anything else
 */
export type ErrorKind =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "rateLimited"
  | "database"
  | "server"
  | "network"
  | "unknown";

export interface ErrorInfo {
  kind: ErrorKind;
  status?: number;
  code?: string;
  /** The server's own words. Only kept for kinds where they are written for people (validation, conflict). */
  detail?: string;
  fieldErrors: { path: string; message: string }[];
  requestId?: string;
  retryAfterSeconds?: number;
  /** Trying the same thing again can succeed (a transient failure or a wait). */
  retryable: boolean;
  /** Safe to retry silently in the background a couple of times (transient infrastructure failures only). */
  autoRetryable: boolean;
}

const asApiError = (error: unknown): Partial<ApiError> & { name?: string } => {
  if (error && typeof error === "object") return error as Partial<ApiError> & { name?: string };
  return {};
};

export function classifyError(error: unknown): ErrorInfo {
  const e = asApiError(error);
  const status = typeof e.status === "number" ? e.status : undefined;
  const base = {
    status,
    code: e.code,
    fieldErrors: Array.isArray(e.fieldErrors) ? e.fieldErrors : [],
    requestId: e.requestId,
    retryAfterSeconds: e.retryAfterSeconds,
  };
  const make = (kind: ErrorKind, opts: { detail?: boolean; retryable?: boolean; auto?: boolean } = {}): ErrorInfo => ({
    ...base,
    kind,
    detail: opts.detail && typeof e.message === "string" && e.message ? e.message : undefined,
    retryable: opts.retryable ?? false,
    autoRetryable: opts.auto ?? false,
  });

  // The server could not be reached at all: our client's marker, or the browser's own failed-fetch error.
  if (e.code === "unavailable" || (status === undefined && (e.name === "TypeError" || e.name === "AbortError"))) {
    return make("network", { retryable: true, auto: true });
  }
  if (status === undefined) return make("unknown", { retryable: true });

  if (status === 401) return make("unauthenticated");
  if (status === 403) return make("forbidden");
  if (status === 404) return make("notFound");
  if (status === 409) return make("conflict", { detail: true, retryable: true });
  if (status === 429) return make("rateLimited", { detail: true, retryable: true });
  if (status === 400 || status === 422 || (status >= 400 && status < 500)) return make("validation", { detail: true });
  if (e.code === "database_unavailable" || e.code === "database_busy") {
    return make("database", { retryable: true, auto: true });
  }
  if (status === 502 || status === 503 || status === 504) return make("network", { retryable: true, auto: true });
  if (status >= 500) return make("server", { retryable: true, auto: true });
  return make("unknown", { retryable: true });
}

/** The message for a form field, from a validation error ("password" -> "Choose a stronger password."), if any. */
export function fieldMessage(info: ErrorInfo, path: string): string | undefined {
  return info.fieldErrors.find((f) => f.path === path)?.message;
}

/** Retry rule for the query client: transient failures twice, everything else never (no waiting on a 403). */
export function shouldAutoRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && classifyError(error).autoRetryable;
}
