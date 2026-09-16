"use client";

import { Calculator } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComingSoon } from "@/components/shared/coming-soon";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function ProfitCalculatorPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("placeholder.profitCalculator.title")} />
      <ComingSoon icon={Calculator} moduleKey="profitCalculator" />
    </>
  );
}
