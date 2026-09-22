import type { ID } from "./common";

export interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Dashboard KPIs. A figure is null when it is not available to the signed-in user (a role without cost access gets
 * no inventory value or gross profit; a role without access to an endpoint gets none of its figures). A delta is null
 * when there is nothing to compare with. Only the demo data is always complete.
 */
export interface DealerPerformanceSummary {
  /** ISO 4217 code of every money figure (the dealership currency). Absent in the demo data (AED). */
  currency?: string;
  totalVehicles: number | null;
  totalVehiclesDelta: number | null;
  availableVehicles: number | null;
  availableVehiclesDelta: number | null;
  vehiclesSold: number | null;
  vehiclesSoldDelta: number | null;
  vehiclesPurchased: number | null;
  vehiclesPurchasedDelta: number | null;
  totalInventoryValue: number | null;
  totalInventoryValueDelta: number | null;
  expectedRevenue: number | null;
  expectedRevenueDelta: number | null;
  grossProfit: number | null;
  grossProfitDelta: number | null;
  monthlySales: number | null;
  monthlySalesDelta: number | null;
  newLeads: number | null;
  newLeadsDelta: number | null;
  conversionRate: number | null;
  conversionRateDelta: number | null;
}

export interface AnalyticsSnapshot {
  salesTrend: ChartPoint[];
  leadFunnel: ChartPoint[];
  inventoryAging: ChartPoint[];
  revenueByMake: ChartPoint[];
  topPerformers: { name: string; deals: number; revenue: number }[];
}

export type AiInsightKind = "price_trend" | "overpriced" | "resale_potential" | "aging" | "opportunity";

export interface AiInsight {
  id: ID;
  kind: AiInsightKind;
  message: string;
  createdAt: string;
}
