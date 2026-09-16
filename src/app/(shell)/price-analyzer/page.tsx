"use client";

import { LineChart } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComingSoon } from "@/components/shared/coming-soon";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function PriceAnalyzerPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("placeholder.priceAnalyzer.title")} />
      <ComingSoon icon={LineChart} moduleKey="priceAnalyzer" />
    </>
  );
}
