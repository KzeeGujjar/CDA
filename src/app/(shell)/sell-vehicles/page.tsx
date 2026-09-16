"use client";

import { Tag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComingSoon } from "@/components/shared/coming-soon";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function SellVehiclesPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("placeholder.sellVehicles.title")} />
      <ComingSoon icon={Tag} moduleKey="sellVehicles" />
    </>
  );
}
