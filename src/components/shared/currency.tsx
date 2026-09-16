import type { Money } from "@/types/common";

export function formatMoney(money: Money): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0,
  }).format(money.amount);
  return formatted.replace(/^([A-Z]{2,3})\s*/, "$1 ");
}

export function Currency({ money, className }: { money: Money; className?: string }) {
  return <span className={className}>{formatMoney(money)}</span>;
}
