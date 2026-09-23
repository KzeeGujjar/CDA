"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { getVehiclePerformanceReport } from "@/services/reportService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { VehiclePerformanceRow } from "@/types/report";
import type { StatusTone } from "@/components/shared/status-badge";

const vehicleStatusTone: Record<string, StatusTone> = {
  Sold: "success",
  Available: "info",
  "Under repair": "danger",
};

export function VehiclePerformanceTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reports", "vehicle-performance"],
    queryFn: getVehiclePerformanceReport,
  });

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const columns: DataTableColumn<VehiclePerformanceRow>[] = [
    { key: "vehicle", header: t("reports.table.vehicle"), render: (r) => r.vehicleLabel },
    { key: "make", header: t("reports.table.make"), render: (r) => r.make },
    { key: "daysToSell", header: t("reports.table.daysToSell"), render: (r) => (r.daysToSell === null ? "—" : r.daysToSell) },
    { key: "views", header: t("reports.table.views"), render: (r) => r.views ?? "—" },
    { key: "inquiries", header: t("reports.table.inquiries"), render: (r) => r.inquiries ?? "—" },
    { key: "status", header: t("reports.table.status"), render: (r) => <StatusBadge label={r.status} tone={vehicleStatusTone[r.status] ?? "neutral"} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <ReportExportButtons />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.topSellingModels")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.topSellingModels} color="var(--color-chart-1)" />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.slowestMoving")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.slowestMoving} color="var(--color-chart-5)" />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
