"use client";

import { AIInsightCard } from "@/components/ai/ai-insight-card";
import { AIAction } from "@/components/ai/ai-action";
import { formatMoney } from "@/components/shared/currency";
import { getExpectedProfit, getProfitMarginPct, getTotalCost } from "@/lib/vehicle-finance";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Vehicle } from "@/types/vehicle";

export function VehicleAiAnalysisCard({
  vehicle,
  analyzing,
  onReviewPricing,
}: {
  vehicle: Vehicle;
  analyzing: boolean;
  onReviewPricing?: () => void;
}) {
  const { t } = useTranslation();

  const marketDeltaPct = ((vehicle.price.amount - vehicle.estimatedMarketValue.amount) / vehicle.estimatedMarketValue.amount) * 100;
  const profitMarginPct = getProfitMarginPct(vehicle);
  const isAging = vehicle.daysInStock > 45;

  const bullets: string[] = [
    marketDeltaPct > 1
      ? `This vehicle is priced ${marketDeltaPct.toFixed(1)}% above its estimated market value of ${formatMoney(vehicle.estimatedMarketValue)}. Consider a price review to stay competitive.`
      : marketDeltaPct < -1
        ? `This vehicle is priced ${Math.abs(marketDeltaPct).toFixed(1)}% below its estimated market value of ${formatMoney(vehicle.estimatedMarketValue)} — strong resale potential.`
        : `Asking price is closely aligned with the estimated market value of ${formatMoney(vehicle.estimatedMarketValue)}.`,
    `At the expected selling price of ${formatMoney(vehicle.expectedSellingPrice)} against a total cost of ${formatMoney({
      amount: getTotalCost(vehicle),
      currency: vehicle.price.currency,
    })}, projected gross profit is ${formatMoney({ amount: getExpectedProfit(vehicle), currency: vehicle.price.currency })} (${profitMarginPct.toFixed(
      1
    )}% margin).`,
    isAging
      ? `This vehicle has been in stock for ${vehicle.daysInStock} days, longer than the dealership average. A targeted price adjustment or bundled offer may accelerate the sale.`
      : `Holding period of ${vehicle.daysInStock} days is within a healthy range for this segment.`,
    vehicle.spec.accidentHistory !== "none"
      ? `Accident history: ${vehicle.spec.accidentHistory}. Ensure this is disclosed transparently in the listing and buyer conversations.`
      : `No accident history on record — a strong selling point to highlight in marketing.`,
  ];

  return (
    <AIInsightCard
      title={t("inventory.actions.aiAnalyze")}
      loading={analyzing}
      items={bullets.map((bullet, i) => ({ id: String(i), message: bullet }))}
      action={
        marketDeltaPct > 1 && onReviewPricing ? (
          <AIAction
            label={t("leads.aiScoring.recommendedAction")}
            description={t("inventory.pricing.aboveMarket")}
            actionLabel={t("inventory.pricing.reviewPricing")}
            onAction={onReviewPricing}
          />
        ) : undefined
      }
    />
  );
}
