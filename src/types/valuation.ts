import type { Money } from "./common";

export interface ValuationQuery {
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  condition: string;
}

export interface ComparableListing {
  id: string;
  source: string;
  title: string;
  price: Money;
  mileageKm: number;
  location: string;
}

export interface MarketValuation {
  estimatedValue: Money;
  lowEstimate: Money;
  highEstimate: Money;
  confidence: "low" | "medium" | "high";
  comparables: ComparableListing[];
}
