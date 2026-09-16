"use client";

import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:start-3 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {t("common.skipToContent")}
    </a>
  );
}
