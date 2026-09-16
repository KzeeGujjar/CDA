"use client";

import { Globe } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComingSoon } from "@/components/shared/coming-soon";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function MarketIntelligencePage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("placeholder.marketIntelligence.title")} />
      <ComingSoon icon={Globe} moduleKey="marketIntelligence" />
    </>
  );
}
