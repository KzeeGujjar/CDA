import { classifyError, type ErrorKind } from "@/lib/errors/classify";

/**
 * One sentence describing a failure, for places that show a single line (a form's error text, the sign-in screen).
 *  - a validation or conflict error says what is wrong, in the server's own words (they are written for people);
 *  - everything else uses the dictionary text for its KIND of failure, so a database outage never shows a SQL
 *    message and a 429 says how long to wait;
 *  - `showServerText` lists kinds whose server message is also safe and useful (sign-in: "Please confirm your email
 *    address before signing in." is a 403 the user needs to read);
 *  - `overrides` replaces the text for a kind (sign-in: a 401 always means "check your details").
 */
export function errorMessage(
  error: unknown,
  t: (key: string) => string,
  opts: { showServerText?: ErrorKind[]; overrides?: Partial<Record<ErrorKind, string>> } = {}
): string {
  const info = classifyError(error);
  const override = opts.overrides?.[info.kind];
  if (override) return override;
  const server = (error as { message?: string } | null)?.message;
  if (opts.showServerText?.includes(info.kind) && server) return server;
  if (info.kind === "validation")
    return info.fieldErrors[0]?.message ?? info.detail ?? t("errors.validation.description");
  if (info.kind === "conflict") return info.detail ?? t("errors.conflict.description");
  if (info.kind === "rateLimited" && info.retryAfterSeconds) {
    return `${t("errors.rateLimited.description")} ${t("errors.tryAgainIn").replace("{seconds}", String(info.retryAfterSeconds))}`;
  }
  return t(`errors.${info.kind}.description`);
}
