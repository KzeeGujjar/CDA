import type { AiInsight, AnalyticsSnapshot, DealerPerformanceSummary } from "@/types/analytics";

export const dealerPerformanceSummaryFixture: DealerPerformanceSummary = {
  totalVehicles: 20,
  totalVehiclesDelta: 11.1,
  availableVehicles: 14,
  availableVehiclesDelta: 7.7,
  vehiclesSold: 2,
  vehiclesSoldDelta: 100,
  vehiclesPurchased: 12,
  vehiclesPurchasedDelta: 20,
  totalInventoryValue: 6_441_000,
  totalInventoryValueDelta: 5.8,
  expectedRevenue: 6_366_000,
  expectedRevenueDelta: 9.4,
  grossProfit: 617_300,
  grossProfitDelta: 6.2,
  monthlySales: 1_245_800,
  monthlySalesDelta: 18.4,
  newLeads: 8,
  newLeadsDelta: 14.3,
  conversionRate: 24.5,
  conversionRateDelta: 2.1,
};

export const analyticsSnapshotFixture: AnalyticsSnapshot = {
  salesTrend: [
    { label: "Apr", value: 1_240_000 },
    { label: "May", value: 1_410_000 },
    { label: "Jun", value: 1_180_000 },
    { label: "Jul", value: 1_620_000 },
    { label: "Aug", value: 1_790_000 },
    { label: "Sep", value: 1_985_000 },
  ],
  leadFunnel: [
    { label: "New", value: 38 },
    { label: "Contacted", value: 27 },
    { label: "Qualified", value: 19 },
    { label: "Negotiation", value: 11 },
    { label: "Won", value: 8 },
  ],
  inventoryAging: [
    { label: "0-14 days", value: 6 },
    { label: "15-30 days", value: 7 },
    { label: "31-60 days", value: 4 },
    { label: "60+ days", value: 3 },
  ],
  revenueByMake: [
    { label: "Toyota", value: 385_000 },
    { label: "Mercedes-Benz", value: 895_000 },
    { label: "Range Rover", value: 520_000 },
    { label: "BMW", value: 445_000 },
    { label: "Porsche", value: 610_000 },
    { label: "Tesla", value: 425_000 },
  ],
  topPerformers: [
    { name: "Layla Hassan", deals: 9, revenue: 1_240_000 },
    { name: "Yousef Karim", deals: 7, revenue: 980_000 },
    { name: "Noora Al Hammadi", deals: 6, revenue: 810_000 },
    { name: "Michael Chen", deals: 5, revenue: 640_000 },
  ],
};

export const aiInsightsFixture: AiInsight[] = [
  {
    id: "insight-001",
    kind: "price_trend",
    message: "Toyota Land Cruiser prices have increased approximately 4.8% over the last 30 days.",
    createdAt: "2026-09-14T06:00:00Z",
  },
  {
    id: "insight-002",
    kind: "overpriced",
    message: "3 vehicles in your inventory are currently priced above estimated market value.",
    createdAt: "2026-09-14T06:00:00Z",
  },
  {
    id: "insight-003",
    kind: "resale_potential",
    message: "2 vehicles may have strong resale potential.",
    createdAt: "2026-09-14T06:00:00Z",
  },
  {
    id: "insight-004",
    kind: "aging",
    message: "Your average inventory holding period increased by 6 days.",
    createdAt: "2026-09-14T06:00:00Z",
  },
];
