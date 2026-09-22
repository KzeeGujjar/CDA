"use client";

import Link from "next/link";
import { Inbox, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { errorIcon, useErrorText } from "@/components/shared/error-state";
import { cn } from "@/utils";

/** The small version of ErrorState for a card, a panel or a menu, where a full-screen message would be too much. */
export function InlineError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const text = useErrorText(error);
  const info = text.info!;
  const Icon = errorIcon[info.kind];
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-dashed border-destructive/40 p-3 text-start",
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{text.title}</p>
        <p className="text-xs text-muted-foreground">{text.detail ?? text.description}</p>
        {text.waitText && <p className="text-xs text-muted-foreground">{text.waitText}</p>}
      </div>
      {info.kind === "unauthenticated" ? (
        <Button size="sm" variant="outline" asChild>
          <Link href="/login">{t("errors.signIn")}</Link>
        </Button>
      ) : (
        onRetry &&
        info.retryable && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )
      )}
    </div>
  );
}

/** "Nothing here" for a card or panel whose data loaded fine but is empty (never a blank area). */
export function InlineEmpty({
  title,
  icon: Icon = Inbox,
  className,
}: {
  title?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground", className)}>
      <Icon className="size-4" />
      <span>{title ?? t("common.noResults")}</span>
    </div>
  );
}
