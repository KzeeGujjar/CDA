"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Gauge, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { getProfitReport } from "@/services/reports";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { ReportProfitRow } from "@/types/report";

export function ProfitReportTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["reports", "profit"], queryFn: getProfitReport });

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const columns: DataTableColumn<ReportProfitRow>[] = [
    { key: "vehicle", header: t("reports.table.vehicle"), render: (r) => r.vehicleLabel },
    {
      key: "costPrice",
      header: t("reports.table.costPrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.costPrice, currency: "AED" })}</span>,
    },
    {
      key: "sellingPrice",
      header: t("reports.table.sellingPrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.sellingPrice, currency: "AED" })}</span>,
    },
    {
      key: "grossProfit",
      header: t("reports.table.grossProfit"),
      render: (r) => <span className="font-mono text-primary">{formatMoney({ amount: r.grossProfit, currency: "AED" })}</span>,
    },
    { key: "margin", header: t("reports.table.margin"), render: (r) => `${r.marginPct.toFixed(1)}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <ReportExportButtons />
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label={t("reports.kpi.grossProfit")} value={formatMoney({ amount: data.grossProfit, currency: "AED" })} delta={data.grossProfitDelta} icon={Banknote} />
          <StatCard label={t("reports.kpi.netMargin")} value={`${data.netMarginPct.toFixed(1)}%`} delta={data.netMarginPctDelta} icon={Gauge} />
          <StatCard label={t("reports.kpi.avgProfitPerUnit")} value={formatMoney({ amount: data.avgProfitPerUnit, currency: "AED" })} delta={data.avgProfitPerUnitDelta} icon={TrendingUp} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.profitTrend")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <LineChartCard data={data.trend} />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.profitByMake")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.byMake} />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
