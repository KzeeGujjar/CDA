import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/components/shared/currency";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { MarketValuation } from "@/types/valuation";

const confidenceTone = { low: "danger", medium: "warning", high: "success" } as const;

export function ValuationGauge({ valuation }: { valuation: MarketValuation }) {
  const { t } = useTranslation();
  const range = valuation.highEstimate.amount - valuation.lowEstimate.amount;
  const position = range > 0 ? ((valuation.estimatedValue.amount - valuation.lowEstimate.amount) / range) * 100 : 50;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("valuation.estimatedValue")}</span>
          <StatusBadge label={`${t("valuation.confidence")}: ${valuation.confidence}`} tone={confidenceTone[valuation.confidence]} />
        </div>
        <span className="font-mono text-4xl font-semibold text-foreground">{formatMoney(valuation.estimatedValue)}</span>
        <div className="flex flex-col gap-1.5">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 start-0 w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <div
              className="absolute top-1/2 size-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-primary rtl:translate-x-1/2"
              style={{ insetInlineStart: `${Math.min(100, Math.max(0, position))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatMoney(valuation.lowEstimate)}</span>
            <span>{formatMoney(valuation.highEstimate)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
