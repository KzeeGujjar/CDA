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

/**
 * Like Currency, but for a figure that may be legitimately absent — a cost the signed-in role may not see
 * (needs profit:read), rather than a loading or error state. Renders the placeholder instead of a blank cell.
 */
export function OptionalCurrency({
  money,
  placeholder = "—",
  className,
}: {
  money: Money | null | undefined;
  placeholder?: string;
  className?: string;
}) {
  return <span className={className}>{money ? formatMoney(money) : placeholder}</span>;
}
