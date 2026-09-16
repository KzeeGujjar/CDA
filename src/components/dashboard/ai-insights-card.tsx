"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Gem, Lightbulb, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AIInsightCard } from "@/components/ai/ai-insight-card";
import { getAiInsights } from "@/services/analytics";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { AiInsightKind } from "@/types/analytics";

const insightIcon: Record<AiInsightKind, LucideIcon> = {
  price_trend: TrendingUp,
  overpriced: AlertTriangle,
  resale_potential: Gem,
  aging: Clock,
  opportunity: Lightbulb,
};

export function AiInsightsCard() {
  const { t } = useTranslation();
  const { data: insights, isLoading } = useQuery({ queryKey: ["ai-insights"], queryFn: getAiInsights });

  return (
    <AIInsightCard
      title={t("dashboard.aiInsights.title")}
      loading={isLoading || !insights}
      items={(insights ?? []).map((insight) => ({
        id: insight.id,
        icon: insightIcon[insight.kind],
        message: insight.message,
      }))}
    />
  );
}
