"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Car, CircleGauge, Handshake, LineChart, PackageCheck, TrendingUp, Truck, Users, Warehouse } from "lucide-react";
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
import { getDealerPerformanceSummary, getAnalyticsSnapshot } from "@/services/analytics";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { formatMoney } from "@/components/shared/currency";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";

export default function DashboardPage() {
  const { t } = useTranslation();
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["dealer-performance-summary"],
    queryFn: getDealerPerformanceSummary,
  });
  const {
    data: snapshot,
    isLoading: snapshotLoading,
    isError: snapshotError,
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
          <StatCard
            label={t("dashboard.kpi.totalVehicles")}
            value={String(summary.totalVehicles)}
            delta={summary.totalVehiclesDelta}
            icon={Car}
          />
          <StatCard
            label={t("dashboard.kpi.availableVehicles")}
            value={String(summary.availableVehicles)}
            delta={summary.availableVehiclesDelta}
            icon={PackageCheck}
          />
          <StatCard
            label={t("dashboard.kpi.vehiclesSold")}
            value={String(summary.vehiclesSold)}
            delta={summary.vehiclesSoldDelta}
            icon={Handshake}
          />
          <StatCard
            label={t("dashboard.kpi.vehiclesPurchased")}
            value={String(summary.vehiclesPurchased)}
            delta={summary.vehiclesPurchasedDelta}
            icon={Truck}
          />
          <StatCard
            label={t("dashboard.kpi.totalInventoryValue")}
            value={formatMoney({ amount: summary.totalInventoryValue, currency: "AED" })}
            delta={summary.totalInventoryValueDelta}
            icon={Warehouse}
          />
          <StatCard
            label={t("dashboard.kpi.expectedRevenue")}
            value={formatMoney({ amount: summary.expectedRevenue, currency: "AED" })}
            delta={summary.expectedRevenueDelta}
            icon={LineChart}
          />
          <StatCard
            label={t("dashboard.kpi.grossProfit")}
            value={formatMoney({ amount: summary.grossProfit, currency: "AED" })}
            delta={summary.grossProfitDelta}
            icon={Banknote}
          />
          <StatCard
            label={t("dashboard.kpi.monthlySales")}
            value={formatMoney({ amount: summary.monthlySales, currency: "AED" })}
            delta={summary.monthlySalesDelta}
            icon={TrendingUp}
          />
          <StatCard
            label={t("dashboard.kpi.newLeads")}
            value={String(summary.newLeads)}
            delta={summary.newLeadsDelta}
            icon={Users}
          />
          <StatCard
            label={t("dashboard.kpi.conversionRate")}
            value={`${summary.conversionRate}%`}
            delta={summary.conversionRateDelta}
            icon={CircleGauge}
          />
        </div>
      )}

      <AiInsightsCard />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ChartWrapper title={t("dashboard.salesTrend")} className="xl:col-span-2">
          {snapshotLoading || !snapshot ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <LineChartCard data={snapshot.salesTrend} />
          )}
        </ChartWrapper>
        <ChartWrapper title={t("dashboard.inventoryAging")}>
          {snapshotLoading || !snapshot ? (
            <Skeleton className="h-64 w-full" />
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
