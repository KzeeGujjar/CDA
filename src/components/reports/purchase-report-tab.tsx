"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Car, TrendingDown } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { getPurchaseReport } from "@/services/reports";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { ReportPurchaseRow } from "@/types/report";

export function PurchaseReportTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["reports", "purchase"], queryFn: getPurchaseReport });

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const columns: DataTableColumn<ReportPurchaseRow>[] = [
    { key: "date", header: t("reports.table.date"), render: (r) => r.date },
    { key: "vehicle", header: t("reports.table.vehicle"), render: (r) => r.vehicleLabel },
    { key: "supplier", header: t("reports.table.supplier"), render: (r) => r.supplierName },
    {
      key: "purchasePrice",
      header: t("reports.table.purchasePrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.purchasePrice, currency: "AED" })}</span>,
    },
    {
      key: "transportCost",
      header: t("reports.table.transportCost"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.transportCost, currency: "AED" })}</span>,
    },
    {
      key: "totalCost",
      header: t("reports.table.totalCost"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.totalCost, currency: "AED" })}</span>,
    },
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
          <StatCard label={t("reports.kpi.totalSpend")} value={formatMoney({ amount: data.totalSpend, currency: "AED" })} delta={data.totalSpendDelta} icon={Banknote} />
          <StatCard label={t("reports.kpi.unitsPurchased")} value={String(data.unitsPurchased)} delta={data.unitsPurchasedDelta} icon={Car} />
          <StatCard label={t("reports.kpi.avgCostPerUnit")} value={formatMoney({ amount: data.avgCostPerUnit, currency: "AED" })} delta={data.avgCostPerUnitDelta} icon={TrendingDown} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.purchaseTrend")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <LineChartCard data={data.trend} />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.purchasesBySource")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.bySource} color="var(--color-chart-3)" />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
