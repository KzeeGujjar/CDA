import type { Currency } from "@/types/common";

export const primaryCurrency: Currency = "AED";

export const supportedCurrencies: Currency[] = ["AED", "USD"];

// AED has been pegged to USD by the UAE Central Bank since 1997.
export const exchangeRatesFromAed: Record<Currency, number> = {
  AED: 1,
  USD: 1 / 3.6725,
};

export function convertFromAed(amountInAed: number, to: Currency): number {
  return Math.round(amountInAed * exchangeRatesFromAed[to] * 100) / 100;
}
