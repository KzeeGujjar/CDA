import type { ApiError } from "@/types/common";

/** An error that is safe to show the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers: Record<string, string> = {},
    public readonly fieldErrors?: { path: string; message: string }[]
  ) {
    super(message);
    this.name = "AppError";
  }

  toApiError(): ApiError {
    return { message: this.message, code: this.code, status: this.status };
  }
}

export const unauthorized = (message = "Authentication required.") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "You do not have permission to do this.", code = "forbidden") =>
  new AppError(403, code, message);
/** Also returned for records that exist in ANOTHER tenant: never reveal that they exist. */
export const notFound = (message = "Not found.") => new AppError(404, "not_found", message);
export const badRequest = (message: string, code = "bad_request") => new AppError(400, code, message);
export const unsupportedMediaType = (message = "Send the request body as JSON (Content-Type: application/json).") =>
  new AppError(415, "unsupported_media_type", message);
export const payloadTooLarge = (message = "The request body is too large.") =>
  new AppError(413, "payload_too_large", message);
export const conflict = (message: string, code = "conflict") => new AppError(409, code, message);
export const tooManyRequests = (retryAfterSeconds: number, message = "Too many attempts. Please try again later.") =>
  new AppError(429, "rate_limited", message, { "retry-after": String(Math.max(1, Math.ceil(retryAfterSeconds))) });

export const weakPassword = (problems: string[]) =>
  new AppError(
    400,
    "weak_password",
    "Choose a stronger password.",
    {},
    problems.map((message) => ({ path: "password", message }))
  );

/** Programming error inside the tenancy layer. Never shown to clients. */
export class TenancyViolationError extends Error {
  constructor(message: string) {
    super(`Tenancy violation: ${message}`);
    this.name = "TenancyViolationError";
  }
}
