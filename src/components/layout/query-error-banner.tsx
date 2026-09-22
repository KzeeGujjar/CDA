"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { classifyError } from "@/lib/errors/classify";
import { errorIcon } from "@/components/shared/error-state";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * The safety net for data that feeds a dropdown, a badge or a menu rather than a screen of its own. Those queries are
 * marked `meta: { banner: true }`; when one of them fails to load, this banner says so (what kind of failure, with
 * Retry, or Sign in when the session expired) instead of the control quietly staying empty.
 */
const failedBannerQueries = (cache: ReturnType<ReturnType<typeof useQueryClient>["getQueryCache"]>) =>
  cache.findAll({
    predicate: (q: Query) =>
      q.meta?.banner === true && q.state.status === "error" && q.state.data === undefined && q.getObserversCount() > 0,
  });

export function QueryErrorBanner() {
  const client = useQueryClient();
  const { t } = useTranslation();
  const [failed, setFailed] = useState<{ hash: string; error: unknown }[]>([]);

  useEffect(() => {
    const cache = client.getQueryCache();
    const update = () => {
      const next = failedBannerQueries(cache).map((q) => ({ hash: q.queryHash, error: q.state.error }));
      setFailed((prev) =>
        prev.length === next.length && prev.every((p, i) => p.hash === next[i].hash && p.error === next[i].error)
          ? prev
          : next
      );
    };
    update();
    return cache.subscribe(update);
  }, [client]);

  if (failed.length === 0) return null;
  const info = classifyError(failed[0].error);
  const Icon = errorIcon[info.kind];

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
    >
      <Icon className="size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-foreground">{t("errors.loadFailed")}</span>
        <span className="text-xs text-muted-foreground">{t(`errors.${info.kind}.description`)}</span>
      </div>
      {info.kind === "unauthenticated" ? (
        <Button size="sm" variant="outline" asChild>
          <Link href="/login">{t("errors.signIn")}</Link>
        </Button>
      ) : (
        info.retryable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              client.refetchQueries({ predicate: (q) => failedBannerQueries(client.getQueryCache()).includes(q) })
            }
          >
            {t("common.retry")}
          </Button>
        )
      )}
    </div>
  );
}
