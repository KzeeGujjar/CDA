import type { ComparableListing, MarketValuation, ValuationQuery } from "@/types/valuation";
import { vehiclesFixture } from "@/mock/vehicles";

const wait = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export async function getMarketValuation(query: ValuationQuery): Promise<MarketValuation> {
  await wait();

  const match = vehiclesFixture.find(
    (v) => v.make.toLowerCase() === query.make.toLowerCase() && v.model.toLowerCase() === query.model.toLowerCase()
  );
  const basePrice = match?.price.amount ?? 150_000;

  const ageAdjustment = Math.max(0, 2026 - query.year) * 0.045;
  const mileageAdjustment = Math.min(0.3, query.mileageKm / 250_000);
  const conditionAdjustment = query.condition === "new" ? 0 : query.condition === "certified_pre_owned" ? 0.04 : 0.08;

  const depreciation = 1 - (ageAdjustment + mileageAdjustment + conditionAdjustment);
  const seed = hash(`${query.make}${query.model}${query.year}${query.mileageKm}`);
  const noise = 1 + ((seed % 700) / 10000 - 0.035);

  const estimatedValue = Math.max(20_000, Math.round((basePrice * Math.max(0.35, depreciation) * noise) / 500) * 500);
  const spread = Math.round(estimatedValue * 0.06);

  const confidence: MarketValuation["confidence"] = match ? "high" : query.mileageKm > 0 ? "medium" : "low";

  const comparables: ComparableListing[] = [
    {
      id: "cmp-1",
      source: "Dubizzle",
      title: `${query.year} ${query.make} ${query.model} — similar spec`,
      price: { amount: estimatedValue + Math.round(spread * 0.4), currency: "AED" },
      mileageKm: Math.max(0, query.mileageKm - 4000),
      location: "Dubai",
    },
    {
      id: "cmp-2",
      source: "YallaMotor",
      title: `${query.year} ${query.make} ${query.model} — lower mileage`,
      price: { amount: estimatedValue + Math.round(spread * 0.9), currency: "AED" },
      mileageKm: Math.max(0, query.mileageKm - 9000),
      location: "Abu Dhabi",
    },
    {
      id: "cmp-3",
      source: "CarSwitch",
      title: `${query.year} ${query.make} ${query.model} — higher mileage`,
      price: { amount: Math.max(20_000, estimatedValue - Math.round(spread * 0.7)), currency: "AED" },
      mileageKm: query.mileageKm + 6000,
      location: "Sharjah",
    },
  ];

  return {
    estimatedValue: { amount: estimatedValue, currency: "AED" },
    lowEstimate: { amount: Math.max(20_000, estimatedValue - spread), currency: "AED" },
    highEstimate: { amount: estimatedValue + spread, currency: "AED" },
    confidence,
    comparables,
  };
}
