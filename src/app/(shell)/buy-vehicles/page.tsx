"use client";

import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComingSoon } from "@/components/shared/coming-soon";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function BuyVehiclesPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("placeholder.buyVehicles.title")} />
      <ComingSoon icon={ShoppingCart} moduleKey="buyVehicles" />
    </>
  );
}
