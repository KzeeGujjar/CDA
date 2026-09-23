"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, MessageSquareText, Sparkles } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { getAiPerformanceReport } from "@/services/reportService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ReportExportButtons } from "@/components/reports/report-export-buttons";
import type { AiPerformanceRow } from "@/types/report";

export function AiPerformanceTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reports", "ai-performance"],
    queryFn: getAiPerformanceReport,
  });

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const columns: DataTableColumn<AiPerformanceRow>[] = [
    { key: "feature", header: t("reports.table.feature"), render: (r) => r.feature },
    { key: "interactions", header: t("reports.table.interactions"), render: (r) => r.interactions },
    { key: "successRate", header: t("reports.table.successRate"), render: (r) => `${r.successRate.toFixed(1)}%` },
    { key: "avgResponseTime", header: t("reports.table.avgResponseTime"), render: (r) => `${r.avgResponseSeconds.toFixed(1)}s` },
    { key: "timeSaved", header: t("reports.table.timeSaved"), render: (r) => `${r.timeSavedHours}h` },
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
          <StatCard label={t("reports.kpi.totalInteractions")} value={String(data.totalInteractions)} delta={data.totalInteractionsDelta} icon={Sparkles} />
          <StatCard
            label={t("reports.kpi.satisfaction")}
            value={data.avgSatisfaction === undefined ? "—" : `${data.avgSatisfaction.toFixed(1)}%`}
            icon={MessageSquareText}
          />
          <StatCard label={t("reports.kpi.timeSaved")} value={`${data.timeSavedHours}h`} icon={Clock} />
        </div>
      )}

      <ChartWrapper title={t("reports.charts.usageTrend")}>
        {isLoading || !data ? <Skeleton className="h-64 w-full" /> : <LineChartCard data={data.usageTrend} />}
      </ChartWrapper>

      <DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} />
    </div>
  );
}
