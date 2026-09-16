"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Car, Clock, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { getSalesReport } from "@/services/reports";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { ReportSaleRow } from "@/types/report";

export function SalesReportTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["reports", "sales"], queryFn: getSalesReport });

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const columns: DataTableColumn<ReportSaleRow>[] = [
    { key: "date", header: t("reports.table.date"), render: (r) => r.date },
    { key: "reference", header: t("reports.table.reference"), render: (r) => <span className="font-mono">{r.reference}</span> },
    { key: "vehicle", header: t("reports.table.vehicle"), render: (r) => r.vehicleLabel },
    { key: "customer", header: t("reports.table.customer"), render: (r) => r.customerName },
    { key: "salesperson", header: t("reports.table.salesperson"), render: (r) => r.salespersonName },
    {
      key: "salePrice",
      header: t("reports.table.salePrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.salePrice, currency: "AED" })}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <ReportExportButtons />
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("reports.kpi.totalRevenue")} value={formatMoney({ amount: data.totalRevenue, currency: "AED" })} delta={data.totalRevenueDelta} icon={Banknote} />
          <StatCard label={t("reports.kpi.unitsSold")} value={String(data.unitsSold)} delta={data.unitsSoldDelta} icon={Car} />
          <StatCard label={t("reports.kpi.avgSalePrice")} value={formatMoney({ amount: data.avgSalePrice, currency: "AED" })} delta={data.avgSalePriceDelta} icon={TrendingUp} />
          <StatCard label={t("reports.kpi.avgDaysToSell")} value={String(data.avgDaysToSell)} delta={data.avgDaysToSellDelta} icon={Clock} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.salesTrend")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <LineChartCard data={data.trend} />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.revenueByMake")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.byMake} color="var(--color-chart-4)" />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
