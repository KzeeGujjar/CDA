"use client";

import { TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { AIAction } from "@/components/ai/ai-action";
import { getLeadAiScoring, type LeadClassification } from "@/lib/lead-scoring";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Lead } from "@/types/lead";

const classificationTone: Record<LeadClassification, StatusTone> = {
  hot: "danger",
  warm: "warning",
  cold: "info",
};

export function LeadAiScoringCard({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const scoring = getLeadAiScoring(lead);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <Zap className="size-4.5" />
          {t("leads.aiScoring.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t("leads.aiScoring.leadScore")}</span>
            <span className="font-mono text-3xl font-semibold text-foreground">
              {scoring.score}
              <span className="text-base font-normal text-muted-foreground"> / 100</span>
            </span>
          </div>
          <StatusBadge
            label={t(`leads.aiScoring.classifications.${scoring.classification}`)}
            tone={classificationTone[scoring.classification]}
          />
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${scoring.score}%` }} />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <TrendingUp className="size-3.5" />
            {t("leads.aiScoring.purchaseProbability")}
          </span>
          <span className="font-mono text-sm font-semibold text-foreground">{scoring.purchaseProbabilityPct}%</span>
        </div>

        <AIAction
          label={t("leads.aiScoring.recommendedAction")}
          description={t(`leads.aiScoring.actions.${scoring.classification}`)}
        />
      </CardContent>
    </Card>
  );
}
