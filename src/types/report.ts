import type { ID } from "./common";
import type { ChartPoint } from "./analytics";

export interface ReportSaleRow {
  id: ID;
  date: string;
  reference: string;
  vehicleLabel: string;
  customerName: string;
  salespersonName: string;
  salePrice: number;
}

export interface SalesReport {
  totalRevenue: number;
  totalRevenueDelta: number;
  unitsSold: number;
  unitsSoldDelta: number;
  avgSalePrice: number;
  avgSalePriceDelta: number;
  avgDaysToSell: number;
  avgDaysToSellDelta: number;
  trend: ChartPoint[];
  byMake: ChartPoint[];
  rows: ReportSaleRow[];
}

export interface ReportPurchaseRow {
  id: ID;
  date: string;
  vehicleLabel: string;
  supplierName: string;
  purchasePrice: number;
  transportCost: number;
  totalCost: number;
}

export interface PurchaseReport {
  totalSpend: number;
  totalSpendDelta: number;
  unitsPurchased: number;
  unitsPurchasedDelta: number;
  avgCostPerUnit: number;
  avgCostPerUnitDelta: number;
  trend: ChartPoint[];
  bySource: ChartPoint[];
  rows: ReportPurchaseRow[];
}

export interface ReportProfitRow {
  id: ID;
  vehicleLabel: string;
  costPrice: number;
  sellingPrice: number;
  grossProfit: number;
  marginPct: number;
}

export interface ProfitReport {
  grossProfit: number;
  grossProfitDelta: number;
  netMarginPct: number;
  netMarginPctDelta: number;
  avgProfitPerUnit: number;
  avgProfitPerUnitDelta: number;
  trend: ChartPoint[];
  byMake: ChartPoint[];
  rows: ReportProfitRow[];
}

export interface ReportInventoryRow {
  id: ID;
  vehicleLabel: string;
  status: string;
  daysInStock: number;
  costPrice: number;
  currentPrice: number;
  location: string;
}

export interface InventoryReport {
  totalUnits: number;
  totalValue: number;
  avgDaysInStock: number;
  agingBuckets: ChartPoint[];
  byStatus: ChartPoint[];
  rows: ReportInventoryRow[];
}

export interface ReportLeadRow {
  id: ID;
  customerName: string;
  source: string;
  stage: string;
  assignedToName: string;
  score: number;
  createdAt: string;
}

export interface LeadReport {
  totalLeads: number;
  totalLeadsDelta: number;
  conversionRate: number;
  conversionRateDelta: number;
  avgResponseHours: number;
  bySource: ChartPoint[];
  funnel: ChartPoint[];
  rows: ReportLeadRow[];
}

export interface SalespersonPerformanceRow {
  id: ID;
  name: string;
  leadsAssigned: number;
  dealsWon: number;
  conversionRate: number;
  revenue: number;
  avgResponseHours: number;
}

export interface SalespersonPerformanceReport {
  rows: SalespersonPerformanceRow[];
  revenueByRep: ChartPoint[];
  dealsByRep: ChartPoint[];
}

export interface VehiclePerformanceRow {
  id: ID;
  vehicleLabel: string;
  make: string;
  daysToSell: number | null;
  views: number;
  inquiries: number;
  status: string;
}

export interface VehiclePerformanceReport {
  rows: VehiclePerformanceRow[];
  topSellingModels: ChartPoint[];
  slowestMoving: ChartPoint[];
}

export interface MarketTrendRow {
  id: ID;
  make: string;
  model: string;
  avgMarketPrice: number;
  yourAvgPrice: number;
  demandIndex: number;
  trendPct: number;
}

export interface MarketReport {
  rows: MarketTrendRow[];
  demandByCategory: ChartPoint[];
  priceTrend: ChartPoint[];
}

export interface AiPerformanceRow {
  id: ID;
  feature: string;
  interactions: number;
  successRate: number;
  avgResponseSeconds: number;
  timeSavedHours: number;
}

export interface AiPerformanceReport {
  totalInteractions: number;
  totalInteractionsDelta: number;
  avgSatisfaction: number;
  timeSavedHours: number;
  usageTrend: ChartPoint[];
  rows: AiPerformanceRow[];
}
