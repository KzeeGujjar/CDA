import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/components/shared/currency";
import { getExpectedProfit, getProfitMarginPct, getTotalCost } from "@/lib/vehicle-finance";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { Vehicle } from "@/types/vehicle";

export function ProfitCard({ vehicle, className }: { vehicle: Vehicle; className?: string }) {
  const { t } = useTranslation();
  const totalCost = getTotalCost(vehicle);
  const expectedProfit = getExpectedProfit(vehicle);
  const profitMarginPct = getProfitMarginPct(vehicle);
  const isPositive = expectedProfit >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className={cn("border-0", className)}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("inventory.expectedProfit")}</span>
          <div className={cn("flex size-7 items-center justify-center rounded-full", isPositive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
            <Icon className="size-3.5" />
          </div>
        </div>
        <span className={cn("font-mono text-2xl font-semibold tabular-nums", isPositive ? "text-primary" : "text-destructive")}>
          {formatMoney({ amount: expectedProfit, currency: vehicle.price.currency })}
        </span>
        <div className="flex items-center justify-between border-t border-border pt-2.5 text-xs">
          <span className="text-muted-foreground">{t("inventory.totalCost")}</span>
          <span className="font-mono font-medium text-foreground">
            {formatMoney({ amount: totalCost, currency: vehicle.price.currency })}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t("inventory.profitMargin")}</span>
          <span className={cn("font-mono font-medium", isPositive ? "text-primary" : "text-destructive")}>
            {profitMarginPct.toFixed(1)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
