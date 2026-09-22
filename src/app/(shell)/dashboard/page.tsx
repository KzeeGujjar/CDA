"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Car,
  CircleGauge,
  Handshake,
  LineChart,
  PackageCheck,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { RecentLeadsCard } from "@/components/dashboard/recent-leads-card";
import { UpcomingFollowUpsCard } from "@/components/dashboard/upcoming-followups-card";
import { AiCopilotCard } from "@/components/dashboard/ai-copilot-card";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { DashboardAdBanner } from "@/components/dashboard/dashboard-ad-banner";
import { getDealerPerformanceSummary, getAnalyticsSnapshot } from "@/services/dashboardService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { formatMoney } from "@/components/shared/currency";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import type { Currency } from "@/types/common";

type KpiKey =
  | "totalVehicles"
  | "availableVehicles"
  | "vehiclesSold"
  | "vehiclesPurchased"
  | "totalInventoryValue"
  | "expectedRevenue"
  | "grossProfit"
  | "monthlySales"
  | "newLeads"
  | "conversionRate";

const kpiCards: { key: KpiKey; icon: LucideIcon; kind: "count" | "money" | "percent" }[] = [
  { key: "totalVehicles", icon: Car, kind: "count" },
  { key: "availableVehicles", icon: PackageCheck, kind: "count" },
  { key: "vehiclesSold", icon: Handshake, kind: "count" },
  { key: "vehiclesPurchased", icon: Truck, kind: "count" },
  { key: "totalInventoryValue", icon: Warehouse, kind: "money" },
  { key: "expectedRevenue", icon: LineChart, kind: "money" },
  { key: "grossProfit", icon: Banknote, kind: "money" },
  { key: "monthlySales", icon: TrendingUp, kind: "money" },
  { key: "newLeads", icon: Users, kind: "count" },
  { key: "conversionRate", icon: CircleGauge, kind: "percent" },
];

export default function DashboardPage() {
  const { t } = useTranslation();
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErr,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["dealer-performance-summary"],
    queryFn: getDealerPerformanceSummary,
  });
  const {
    data: snapshot,
    isLoading: snapshotLoading,
    isError: snapshotError,
    error: snapshotErr,
    refetch: refetchSnapshot,
  } = useQuery({
    queryKey: ["analytics-snapshot"],
    queryFn: getAnalyticsSnapshot,
  });

  if (summaryError || snapshotError) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />
        <ErrorState
          error={summaryErr ?? snapshotErr}
          onRetry={() => {
            refetchSummary();
            refetchSnapshot();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <DashboardAdBanner />

      <AiCopilotCard />

      {summaryLoading || !summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {kpiCards.map(({ key, icon, kind }) => {
            // A figure this user may not see (cost, profit) is left out, never shown as 0.
            const amount = summary[key];
            if (amount === null) return null;
            const value =
              kind === "money"
                ? formatMoney({ amount, currency: (summary.currency ?? "AED") as Currency })
                : kind === "percent"
                  ? `${amount}%`
                  : String(amount);
            return (
              <StatCard
                key={key}
                label={t(`dashboard.kpi.${key}`)}
                value={value}
                delta={summary[`${key}Delta`] ?? undefined}
                icon={icon}
              />
            );
          })}
        </div>
      )}

      <AiInsightsCard />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ChartWrapper title={t("dashboard.salesTrend")} className="xl:col-span-2">
          {snapshotLoading || !snapshot ? (
            <Skeleton className="h-64 w-full" />
          ) : snapshot.salesTrend.length === 0 ? (
            <EmptyState icon={LineChart} title={t("common.noResults")} />
          ) : (
            <LineChartCard data={snapshot.salesTrend} />
          )}
        </ChartWrapper>
        <ChartWrapper title={t("dashboard.inventoryAging")}>
          {snapshotLoading || !snapshot ? (
            <Skeleton className="h-64 w-full" />
          ) : snapshot.inventoryAging.length === 0 ? (
            <EmptyState icon={LineChart} title={t("common.noResults")} />
          ) : (
            <BarChartCard data={snapshot.inventoryAging} />
          )}
        </ChartWrapper>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RecentLeadsCard />
        <UpcomingFollowUpsCard />
      </div>
    </>
  );
}
