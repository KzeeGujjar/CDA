import { Currency } from "@/components/shared/currency";
import { StatusBadge } from "@/components/shared/status-badge";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Money } from "@/types/common";
import { cn } from "@/utils";

export function PriceBadge({
  price,
  marketValue,
  className,
}: {
  price: Money;
  marketValue?: Money;
  className?: string;
}) {
  const { t } = useTranslation();
  const deltaPct = marketValue ? ((price.amount - marketValue.amount) / marketValue.amount) * 100 : 0;
  const showDealTag = marketValue && Math.abs(deltaPct) > 1;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Currency money={price} className="font-mono font-semibold text-foreground" />
      {showDealTag && (
        <StatusBadge
          label={deltaPct > 0 ? t("inventory.pricing.aboveMarket") : t("inventory.pricing.belowMarket")}
          tone={deltaPct > 0 ? "warning" : "success"}
        />
      )}
    </div>
  );
}
