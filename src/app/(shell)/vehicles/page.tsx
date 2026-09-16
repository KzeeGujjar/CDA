"use client";

import { Car } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComingSoon } from "@/components/shared/coming-soon";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function VehiclesPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("placeholder.vehicles.title")} />
      <ComingSoon icon={Car} moduleKey="vehicles" />
    </>
  );
}
