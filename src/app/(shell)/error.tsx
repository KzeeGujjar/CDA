"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * An unexpected error while rendering any page inside the app shell. The sidebar and top bar stay, and the page area
 * shows a message with Retry instead of going blank. (Failed data requests are shown by the pages themselves.)
 */
export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title={t("errors.page.title")}
      description={`${t("errors.page.description")}${error.digest ? `  (${t("errors.reference")}: ${error.digest})` : ""}`}
      onRetry={reset}
    />
  );
}
