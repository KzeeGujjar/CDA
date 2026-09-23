import type { AiInsight, AnalyticsSnapshot, ChartPoint, DealerPerformanceSummary } from "@/types/analytics";
import { aiInsightsFixture, analyticsSnapshotFixture, dealerPerformanceSummaryFixture } from "@/mock/analytics";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dashboard data. Connected to the backend's dashboard endpoints: with a real session the numbers are computed
 * by the database for exactly what this user may see. A figure the user's role may not see (cost, profit) or
 * a slice their role has no permission for at all comes back as `null`, never as 0, so the page can leave it
 * out — this is now decided server-side, in one call (§0.20's `/dashboard/summary`, a `composed` route: any
 * signed-in user may call it, and it is the route itself that never fabricates a slice it cannot compute).
 * Without a session the built-in demo data is used, as before.
 *
 * Not on the backend yet, so empty in live mode rather than invented: lead funnel, revenue by make, top
 * performers (unused by the dashboard page itself today — see src/types/analytics.ts).
 */

interface MetricDto {
  value: number | null;
  change: number | null;
}
interface AiInsightDto {
  id: string;
  kind: AiInsight["kind"];
  message: string;
  createdAt: string;
}
interface SummaryDto {
  currency: string;
  totalVehicles: MetricDto | null;
  availableVehicles: MetricDto | null;
  vehiclesPurchased: MetricDto | null;
  expectedRevenue: MetricDto | null;
  totalInventoryValue: MetricDto | null;
  vehiclesSold: MetricDto | null;
  monthlySales: MetricDto | null;
  grossProfit: MetricDto | null;
  newLeads: MetricDto | null;
  conversionRate: MetricDto | null;
  inventoryAging: ChartPoint[];
  aiInsights: AiInsightDto[];
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

async function fetchSummary(): Promise<SummaryDto> {
  return unwrapBackend(await backendRequest<SummaryDto>("GET", "/dashboard/summary?period=month"));
}

async function liveSummary(): Promise<DealerPerformanceSummary> {
  const s = await fetchSummary();
  return {
    currency: s.currency,
    totalVehicles: value(s.totalVehicles),
    totalVehiclesDelta: change(s.totalVehicles),
    availableVehicles: value(s.availableVehicles),
    availableVehiclesDelta: change(s.availableVehicles),
    vehiclesSold: value(s.vehiclesSold),
    vehiclesSoldDelta: change(s.vehiclesSold),
    vehiclesPurchased: value(s.vehiclesPurchased),
    vehiclesPurchasedDelta: change(s.vehiclesPurchased),
    totalInventoryValue: value(s.totalInventoryValue),
    totalInventoryValueDelta: change(s.totalInventoryValue),
    expectedRevenue: value(s.expectedRevenue),
    expectedRevenueDelta: change(s.expectedRevenue),
    grossProfit: value(s.grossProfit),
    grossProfitDelta: change(s.grossProfit),
    monthlySales: value(s.monthlySales),
    monthlySalesDelta: change(s.monthlySales),
    newLeads: value(s.newLeads),
    newLeadsDelta: change(s.newLeads),
    conversionRate: value(s.conversionRate),
    conversionRateDelta: change(s.conversionRate),
  };
}

/** "2026-09-01" -> "Sep" (the month is a calendar label, so no time zone shifts it). */
const monthLabel = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

async function liveSnapshot(): Promise<AnalyticsSnapshot> {
  const [trend, summary] = await Promise.all([
    readIfAllowed<TrendDto>("/dashboard/sales-trend?months=6"),
    fetchSummary().catch(() => null),
  ]);
  const salesTrend: ChartPoint[] = (trend?.months ?? []).map((m) => ({ label: monthLabel(m.month), value: m.revenue }));
  return { salesTrend, leadFunnel: [], inventoryAging: summary?.inventoryAging ?? [], revenueByMake: [], topPerformers: [] };
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
    live: async () => (await fetchSummary()).aiInsights,
    demo: async () => {
      await wait(300);
      return aiInsightsFixture;
    },
  });
}
