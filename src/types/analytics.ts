import type { ID } from "./common";

export interface ChartPoint {
  label: string;
  value: number;
}

export interface DealerPerformanceSummary {
  totalVehicles: number;
  totalVehiclesDelta: number;
  availableVehicles: number;
  availableVehiclesDelta: number;
  vehiclesSold: number;
  vehiclesSoldDelta: number;
  vehiclesPurchased: number;
  vehiclesPurchasedDelta: number;
  totalInventoryValue: number;
  totalInventoryValueDelta: number;
  expectedRevenue: number;
  expectedRevenueDelta: number;
  grossProfit: number;
  grossProfitDelta: number;
  monthlySales: number;
  monthlySalesDelta: number;
  newLeads: number;
  newLeadsDelta: number;
  conversionRate: number;
  conversionRateDelta: number;
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
