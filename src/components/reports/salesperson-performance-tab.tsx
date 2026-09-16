"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { getSalespersonPerformanceReport } from "@/services/reports";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { SalespersonPerformanceRow } from "@/types/report";

export function SalespersonPerformanceTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reports", "salesperson"],
    queryFn: getSalespersonPerformanceReport,
  });

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const columns: DataTableColumn<SalespersonPerformanceRow>[] = [
    { key: "name", header: t("reports.table.salesperson"), render: (r) => r.name },
    { key: "leadsAssigned", header: t("reports.table.leadsAssigned"), render: (r) => r.leadsAssigned },
    { key: "dealsWon", header: t("reports.table.dealsWon"), render: (r) => r.dealsWon },
    { key: "conversionRate", header: t("reports.table.conversionRate"), render: (r) => `${r.conversionRate}%` },
    {
      key: "revenue",
      header: t("reports.table.revenue"),
      render: (r) => <span className="font-mono">{formatMoney({ amount: r.revenue, currency: "AED" })}</span>,
    },
    { key: "avgResponse", header: t("reports.table.avgResponse"), render: (r) => `${r.avgResponseHours}h` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <ReportExportButtons />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.revenueByRep")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.revenueByRep} color="var(--color-chart-1)" />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.dealsByRep")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.dealsByRep} color="var(--color-chart-4)" />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
