import type { ApiError } from "@/types/common";
import type { AiInsight, AnalyticsSnapshot, ChartPoint, DealerPerformanceSummary } from "@/types/analytics";
import { aiInsightsFixture, analyticsSnapshotFixture, dealerPerformanceSummaryFixture } from "@/mock/analytics";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dashboard data. Connected to the backend's four dashboard endpoints (/dashboard/inventory, /sales, /leads,
 * /sales-trend): with a real session the numbers are computed by the database for exactly what this user may see.
 * A figure the user's role may not see (cost, profit) or an endpoint they may not call comes back as `null`, never
 * as 0, so the page can leave it out. Without a session the built-in demo data is used, as before.
 *
 * Not on the backend yet, so empty in live mode rather than invented: lead funnel, inventory aging, revenue by
 * make, top performers, AI insights.
 */

interface MetricDto {
  value: number | null;
  change: number | null;
}
interface InventoryDto {
  currency: string;
  totalVehicles: MetricDto;
  availableVehicles: MetricDto;
  vehiclesPurchased: MetricDto;
  expectedRevenue: MetricDto;
  inventoryValue: MetricDto | null;
}
interface SalesDto {
  currency: string;
  vehiclesSold: MetricDto;
  monthlySales: MetricDto;
  grossProfit: MetricDto | null;
}
interface LeadsDto {
  currency: string;
  newLeads: MetricDto;
  conversionRate: MetricDto;
}
interface TrendDto {
  months: { month: string; revenue: number }[];
}

/** null when the caller's role is not allowed to read this endpoint (403); any other failure is an error. */
async function readIfAllowed<T>(path: string): Promise<T | null> {
  const result = await backendRequest<T>("GET", path);
  if (result.kind === "error" && result.error.status === 403) return null;
  return unwrapBackend(result);
}

const value = (m: MetricDto | null | undefined) => m?.value ?? null;
const change = (m: MetricDto | null | undefined) => m?.change ?? null;

async function liveSummary(): Promise<DealerPerformanceSummary> {
  const [inventory, sales, leads] = await Promise.all([
    readIfAllowed<InventoryDto>("/dashboard/inventory?period=month"),
    readIfAllowed<SalesDto>("/dashboard/sales?period=month"),
    readIfAllowed<LeadsDto>("/dashboard/leads?period=month"),
  ]);
  if (!inventory && !sales && !leads) {
    const denied: ApiError = { message: "Your role cannot view the dashboard.", code: "forbidden", status: 403 };
    throw denied;
  }
  return {
    currency: inventory?.currency ?? sales?.currency ?? leads?.currency,
    totalVehicles: value(inventory?.totalVehicles),
    totalVehiclesDelta: change(inventory?.totalVehicles),
    availableVehicles: value(inventory?.availableVehicles),
    availableVehiclesDelta: change(inventory?.availableVehicles),
    vehiclesSold: value(sales?.vehiclesSold),
    vehiclesSoldDelta: change(sales?.vehiclesSold),
    vehiclesPurchased: value(inventory?.vehiclesPurchased),
    vehiclesPurchasedDelta: change(inventory?.vehiclesPurchased),
    totalInventoryValue: value(inventory?.inventoryValue),
    totalInventoryValueDelta: change(inventory?.inventoryValue),
    expectedRevenue: value(inventory?.expectedRevenue),
    expectedRevenueDelta: change(inventory?.expectedRevenue),
    grossProfit: value(sales?.grossProfit),
    grossProfitDelta: change(sales?.grossProfit),
    monthlySales: value(sales?.monthlySales),
    monthlySalesDelta: change(sales?.monthlySales),
    newLeads: value(leads?.newLeads),
    newLeadsDelta: change(leads?.newLeads),
    conversionRate: value(leads?.conversionRate),
    conversionRateDelta: change(leads?.conversionRate),
  };
}

/** "2026-09-01" -> "Sep" (the month is a calendar label, so no time zone shifts it). */
const monthLabel = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

async function liveSnapshot(): Promise<AnalyticsSnapshot> {
  const trend = await readIfAllowed<TrendDto>("/dashboard/sales-trend?months=6");
  const salesTrend: ChartPoint[] = (trend?.months ?? []).map((m) => ({ label: monthLabel(m.month), value: m.revenue }));
  return { salesTrend, leadFunnel: [], inventoryAging: [], revenueByMake: [], topPerformers: [] };
}

export function getDealerPerformanceSummary(): Promise<DealerPerformanceSummary> {
  return liveOrDemo({
    live: liveSummary,
    demo: async () => {
      await wait();
      return dealerPerformanceSummaryFixture;
    },
  });
}

export function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  return liveOrDemo({
    live: liveSnapshot,
    demo: async () => {
      await wait();
      return analyticsSnapshotFixture;
    },
  });
}

export function getAiInsights(): Promise<AiInsight[]> {
  return liveOrDemo({
    live: async () => [],
    demo: async () => {
      await wait(300);
      return aiInsightsFixture;
    },
  });
}
