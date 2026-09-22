"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * The last safety net for a page outside the app shell (the landing page, sign-in): an unexpected error while
 * rendering shows this instead of a blank page. `reset` re-renders the page.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">{t("errors.page.title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("errors.page.description")}</p>
        {error.digest && (
          <p className="font-mono text-[11px] text-muted-foreground">
            {t("errors.reference")}: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>{t("common.retry")}</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">{t("errors.page.goDashboard")}</Link>
        </Button>
      </div>
    </main>
  );
}
