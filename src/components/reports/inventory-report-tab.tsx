"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, PackageCheck, Warehouse } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/components/shared/currency";
import { getInventoryReport } from "@/services/reportService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { ReportInventoryRow } from "@/types/report";
import type { StatusTone } from "@/components/shared/status-badge";

const inventoryStatusTone: Record<string, StatusTone> = {
  Available: "success",
  Reserved: "info",
  "In transit": "warning",
  "Under inspection": "warning",
  "Under repair": "danger",
};

export function InventoryReportTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["reports", "inventory"], queryFn: getInventoryReport });

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const columns: DataTableColumn<ReportInventoryRow>[] = [
    { key: "vehicle", header: t("reports.table.vehicle"), render: (r) => r.vehicleLabel },
    { key: "status", header: t("reports.table.status"), render: (r) => <StatusBadge label={r.status} tone={inventoryStatusTone[r.status] ?? "neutral"} /> },
    { key: "daysInStock", header: t("reports.table.daysInStock"), render: (r) => r.daysInStock },
    {
      key: "costPrice",
      header: t("reports.table.costPrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.costPrice, currency: "AED" })}</span>,
    },
    {
      key: "currentPrice",
      header: t("reports.table.currentPrice"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.currentPrice, currency: "AED" })}</span>,
    },
    { key: "location", header: t("reports.table.location"), render: (r) => r.location },
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
          <StatCard label={t("reports.kpi.totalUnits")} value={String(data.totalUnits)} icon={PackageCheck} />
          <StatCard label={t("reports.kpi.totalValue")} value={formatMoney({ amount: data.totalValue, currency: "AED" })} icon={Warehouse} />
          <StatCard label={t("reports.kpi.avgDaysInStock")} value={String(data.avgDaysInStock)} icon={Clock} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.inventoryAging")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.agingBuckets} />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.inventoryByStatus")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.byStatus} color="var(--color-chart-5)" />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
