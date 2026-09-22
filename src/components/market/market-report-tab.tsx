"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { getMarketReport } from "@/services/reportService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { MarketTrendRow } from "@/types/report";

export function MarketReportTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["reports", "market"], queryFn: getMarketReport });

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const columns: DataTableColumn<MarketTrendRow>[] = [
    { key: "make", header: t("reports.table.make"), render: (r) => r.make },
    { key: "model", header: t("reports.table.model"), render: (r) => r.model },
    {
      key: "avgMarketPrice",
      header: t("reports.table.avgMarketPrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.avgMarketPrice, currency: "AED" })}</span>,
    },
    {
      key: "yourAvgPrice",
      header: t("reports.table.yourAvgPrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.yourAvgPrice, currency: "AED" })}</span>,
    },
    { key: "demandIndex", header: t("reports.table.demandIndex"), render: (r) => r.demandIndex },
    {
      key: "trend",
      header: t("reports.table.trend"),
      render: (r) => (
        <span className={r.trendPct >= 0 ? "text-primary" : "text-destructive"}>
          {r.trendPct >= 0 ? "+" : ""}
          {r.trendPct.toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <ReportExportButtons />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.demandByCategory")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.demandByCategory} color="var(--color-chart-2)" />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.priceTrend")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <LineChartCard data={data.priceTrend} />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
