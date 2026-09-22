/**
 * A transparent vehicle valuation from comparable vehicles. Pure and deterministic (no I/O, no clock, no
 * randomness), so the same comparables always give the same answer and the method can be unit-tested.
 *
 * IMPORTANT: this is an estimate from the comparables the caller supplies (in the AI agent, the dealership's
 * OWN stock and past sales). It is not market data, and it says how many comparables it used and how sure it
 * is. With fewer than 3 comparables it refuses to give a number.
 *
 * Method: each comparable's price is adjusted to the target (about +6% per year newer than the comparable,
 * -/+1.5% per 10,000 km more/less mileage on the comparable, each within limits), then averaged with weights:
 * a real sale counts fully, an asking price 0.6, and a comparable that is further in age from the target counts
 * less. The range is the mean +/- the larger of one weighted standard deviation and 5%.
 */
export interface ValuationTarget {
  make: string;
  model: string;
  year: number;
  mileageKm: number;
}

export interface Comparable {
  id: string;
  /** "sold": a completed sale price. "stock": an asking price (less reliable). */
  source: "sold" | "stock";
  title: string;
  year: number;
  mileageKm: number | null;
  price: number;
}

export interface ValuationEstimate {
  estimatedValue: number;
  lowEstimate: number;
  highEstimate: number;
  confidence: "low" | "medium" | "high";
  comparablesUsed: number;
  soldComparables: number;
  comparables: (Comparable & { adjustedPrice: number; weight: number })[];
  method: string;
}

export const MIN_COMPARABLES = 3;
const round100 = (n: number) => Math.round(n / 100) * 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function estimateFromComparables(target: ValuationTarget, comparables: Comparable[]): ValuationEstimate | null {
  const usable = comparables.filter((c) => Number.isFinite(c.price) && c.price > 0);
  if (usable.length < MIN_COMPARABLES) return null;

  const adjusted = usable.map((c) => {
    const yearFactor = clamp(1 + 0.06 * (target.year - c.year), 0.6, 1.6);
    const mileageFactor =
      c.mileageKm === null ? 1 : clamp(1 + 0.015 * ((c.mileageKm - target.mileageKm) / 10_000), 0.8, 1.2);
    const adjustedPrice = c.price * yearFactor * mileageFactor;
    const weight = (c.source === "sold" ? 1 : 0.6) / (1 + Math.abs(target.year - c.year));
    return { ...c, adjustedPrice, weight };
  });
  const totalWeight = adjusted.reduce((n, c) => n + c.weight, 0);
  const mean = adjusted.reduce((n, c) => n + c.adjustedPrice * c.weight, 0) / totalWeight;
  const variance = adjusted.reduce((n, c) => n + c.weight * (c.adjustedPrice - mean) ** 2, 0) / totalWeight;
  const sd = Math.sqrt(variance);
  const spread = Math.max(sd, mean * 0.05);
  const relative = sd / mean;
  const soldComparables = adjusted.filter((c) => c.source === "sold").length;
  const confidence =
    adjusted.length >= 8 && relative < 0.1 && soldComparables >= 3
      ? "high"
      : adjusted.length >= 5 && relative < 0.2
        ? "medium"
        : "low";
  return {
    estimatedValue: round100(mean),
    lowEstimate: round100(Math.max(0, mean - spread)),
    highEstimate: round100(mean + spread),
    confidence,
    comparablesUsed: adjusted.length,
    soldComparables,
    comparables: adjusted
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map((c) => ({ ...c, adjustedPrice: Math.round(c.adjustedPrice), weight: Math.round(c.weight * 100) / 100 })),
    method:
      "Weighted average of the dealership's own comparable stock (asking prices) and past sales, adjusted for year and mileage. Not market data.",
  };
}
