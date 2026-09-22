"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Database,
  FileQuestion,
  GitMerge,
  LogIn,
  ShieldOff,
  TextCursorInput,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { classifyError, type ErrorInfo, type ErrorKind } from "@/lib/errors/classify";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";

export const errorIcon: Record<ErrorKind, LucideIcon> = {
  validation: TextCursorInput,
  unauthenticated: LogIn,
  forbidden: ShieldOff,
  notFound: FileQuestion,
  conflict: GitMerge,
  rateLimited: Clock,
  database: Database,
  server: AlertTriangle,
  network: WifiOff,
  unknown: AlertTriangle,
};

/** What to tell the user about a failure: the words come from the dictionary by kind, never from the server (except validation and conflict details). */
export function useErrorText(error: unknown, override?: { title?: string; description?: string }) {
  const { t } = useTranslation();
  const info: ErrorInfo | null = error === undefined ? null : classifyError(error);
  // The server's own sentence is only worth showing when it adds something: not above a list of fields, not a repeat of the wait time.
  const detail =
    info?.detail && info.kind !== "rateLimited" && !(info.kind === "validation" && info.fieldErrors.length > 0)
      ? info.detail
      : undefined;
  return {
    info,
    detail,
    title: override?.title ?? (info ? t(`errors.${info.kind}.title`) : t("common.somethingWentWrong")),
    description:
      override?.description ??
      (info ? t(`errors.${info.kind}.description`) : t("common.somethingWentWrongDescription")),
    waitText:
      info?.kind === "rateLimited" && info.retryAfterSeconds
        ? t("errors.tryAgainIn").replace("{seconds}", String(info.retryAfterSeconds))
        : undefined,
  };
}

/**
 * A failed operation, in words a person can act on. Pass the error (`error={query.error}`) and the screen says
 * whether the session expired (with a Sign in button), the role is not allowed, the input is wrong (with which
 * fields), a rule or existing data got in the way, or the server or database is unavailable (with Retry and a
 * reference to quote). Without `error` it is the original generic message.
 */
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  className,
}: {
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const text = useErrorText(error, { title, description });
  const info = text.info;
  const Icon = info ? errorIcon[info.kind] : AlertTriangle;
  const canRetry = !!onRetry && (info ? info.retryable : true);

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{text.title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{text.description}</p>
        {text.detail && <p className="max-w-sm text-sm text-foreground">{text.detail}</p>}
        {text.waitText && <p className="max-w-sm text-sm text-muted-foreground">{text.waitText}</p>}
      </div>
      {info && info.fieldErrors.length > 0 && (
        <ul className="flex max-w-sm list-disc flex-col gap-0.5 ps-5 text-start text-xs text-muted-foreground">
          {info.fieldErrors.slice(0, 5).map((f) => (
            <li key={`${f.path}:${f.message}`}>{f.message}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {info?.kind === "unauthenticated" && (
          <Button size="sm" asChild>
            <Link href="/login">{t("errors.signIn")}</Link>
          </Button>
        )}
        {canRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )}
      </div>
      {info?.requestId && (
        <p className="font-mono text-[11px] text-muted-foreground">
          {t("errors.reference")}: {info.requestId}
        </p>
      )}
    </div>
  );
}
