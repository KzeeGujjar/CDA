import { toast } from "sonner";
import en from "@/locales/en.json";
import { classifyError } from "@/lib/errors/classify";

/**
 * Tells the user about a failure that no screen is showing (a save that failed, a refresh that failed behind data that
 * is already on screen, a session that expired). The words come from the dictionary by KIND of failure; the server's
 * own text is used only where it is written for people (a validation or conflict detail). Repeats collapse into one
 * toast, so ten calls failing at once (an expired session) make one notice, not ten.
 */
type Translate = (key: string) => string;

const lookup = (key: string): string => {
  const value = key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], en);
  return typeof value === "string" ? value : key;
};

let translate: Translate = lookup;

/** Called by the app once the language is known, so toasts speak the user's language. */
export function setErrorTranslator(fn: Translate | null): void {
  translate = fn ?? lookup;
}

export function notifyError(error: unknown, opts: { title?: string } = {}): void {
  const t = translate;
  const info = classifyError(error);

  if (info.kind === "unauthenticated") {
    toast.error(t("errors.sessionExpiredToast"), {
      id: "session-expired",
      duration: 15_000,
      action: {
        label: t("errors.signIn"),
        onClick: () => {
          // A full navigation on purpose: it drops the stale client state of the expired session.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
        },
      },
    });
    return;
  }

  const title = opts.title ?? t(`errors.${info.kind}.title`);
  const description =
    info.kind === "validation"
      ? (info.fieldErrors[0]?.message ?? info.detail ?? t("errors.validation.description"))
      : info.kind === "conflict"
        ? (info.detail ?? t("errors.conflict.description"))
        : info.kind === "rateLimited" && info.retryAfterSeconds
          ? t("errors.tryAgainIn").replace("{seconds}", String(info.retryAfterSeconds))
          : t(`errors.${info.kind}.description`);
  toast.error(title, { id: `error:${info.kind}:${title}`, description });
}
