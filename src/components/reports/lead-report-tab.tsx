"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, Target, Users } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { getLeadReport } from "@/services/reports";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { ReportLeadRow } from "@/types/report";
import type { StatusTone } from "@/components/shared/status-badge";

const leadStageTone: Record<string, StatusTone> = {
  New: "info",
  Contacted: "neutral",
  Qualified: "warning",
  Negotiation: "warning",
  Won: "success",
};

export function LeadReportTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["reports", "leads"], queryFn: getLeadReport });

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const columns: DataTableColumn<ReportLeadRow>[] = [
    { key: "customer", header: t("reports.table.customer"), render: (r) => r.customerName },
    { key: "source", header: t("reports.table.source"), render: (r) => r.source },
    { key: "stage", header: t("reports.table.stage"), render: (r) => <StatusBadge label={r.stage} tone={leadStageTone[r.stage] ?? "neutral"} /> },
    { key: "assignedTo", header: t("reports.table.assignedTo"), render: (r) => r.assignedToName },
    { key: "score", header: t("reports.table.score"), render: (r) => <span className="font-mono">{r.score}</span> },
    { key: "date", header: t("reports.table.date"), render: (r) => r.createdAt },
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
          <StatCard label={t("reports.kpi.totalLeads")} value={String(data.totalLeads)} delta={data.totalLeadsDelta} icon={Users} />
          <StatCard label={t("reports.kpi.conversionRate")} value={`${data.conversionRate}%`} delta={data.conversionRateDelta} icon={Target} />
          <StatCard label={t("reports.kpi.avgResponseTime")} value={`${data.avgResponseHours}h`} icon={Clock} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartWrapper title={t("reports.charts.leadFunnel")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.funnel} color="var(--color-chart-3)" />}
        </ChartWrapper>
        <ChartWrapper title={t("reports.charts.leadsBySource")}>
          {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <BarChartCard data={data.bySource} color="var(--color-chart-2)" />}
        </ChartWrapper>
      </div>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
