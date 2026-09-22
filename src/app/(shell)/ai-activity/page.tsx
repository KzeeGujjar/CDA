"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Search, Sparkles, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { getAiActivityLog, getAiActivitySummary } from "@/services/aiActivityService";
import { aiActionMeta, aiActionTypes } from "@/lib/ai-action-meta";
import { activityStatusOrder, activityStatusTone } from "@/components/ai-activity/activity-status";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { AiActionType, AiActivityEntry, AiActivityStatus } from "@/types/ai-activity";

export default function AiActivityPage() {
  const { t, locale } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AiActivityStatus | "all">("all");
  const [actionFilter, setActionFilter] = useState<AiActionType | "all">("all");

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErr,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["ai-activity-summary"],
    queryFn: getAiActivitySummary,
  });

  const {
    data: entries,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["ai-activity", search, statusFilter, actionFilter],
    queryFn: () =>
      getAiActivityLog({
        search: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        action: actionFilter === "all" ? undefined : actionFilter,
      }),
  });

  if (summaryError) {
    return (
      <>
        <PageHeader title={t("aiActivity.title")} subtitle={t("aiActivity.subtitle")} />
        <ErrorState error={summaryErr} onRetry={() => refetchSummary()} />
      </>
    );
  }

  const columns: DataTableColumn<AiActivityEntry>[] = [
    {
      key: "time",
      header: t("aiActivity.table.time"),
      render: (e) => (
        <span className="font-mono text-sm">
          {new Date(e.timestamp).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "action",
      header: t("aiActivity.table.action"),
      render: (e) => {
        const meta = aiActionMeta[e.action];
        const Icon = meta.icon;
        return (
          <span className="inline-flex items-center gap-1.5">
            <Icon className="size-3.5 text-primary" />
            {t(`aiActivity.actions.${meta.labelKey}`)}
          </span>
        );
      },
    },
    { key: "vehicle", header: t("aiActivity.table.vehicle"), render: (e) => e.vehicleLabel ?? "—" },
    { key: "customer", header: t("aiActivity.table.customer"), render: (e) => e.customerName ?? "—" },
    {
      key: "result",
      header: t("aiActivity.table.result"),
      render: (e) => <span className="text-muted-foreground">{e.result}</span>,
    },
    {
      key: "status",
      header: t("aiActivity.table.status"),
      render: (e) => <StatusBadge label={t(`aiActivity.status.${e.status}`)} tone={activityStatusTone(e.status)} />,
    },
  ];

  return (
    <>
      <PageHeader title={t("aiActivity.title")} subtitle={t("aiActivity.subtitle")} />

      {summaryLoading || !summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("aiActivity.kpi.totalActions")} value={String(summary.totalActions)} icon={Sparkles} />
          <StatCard label={t("aiActivity.kpi.completed")} value={String(summary.completed)} icon={CheckCircle2} />
          <StatCard label={t("aiActivity.kpi.needsReview")} value={String(summary.needsReview)} icon={TriangleAlert} />
          <StatCard label={t("aiActivity.kpi.timeSaved")} value={`${summary.timeSavedHours}h`} icon={Clock} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-56 ps-8"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as AiActionType | "all")}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("aiActivity.allActions")}</SelectItem>
            {aiActionTypes.map((a) => (
              <SelectItem key={a} value={a}>
                {t(`aiActivity.actions.${aiActionMeta[a].labelKey}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AiActivityStatus | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("aiActivity.allStatuses")}</SelectItem>
            {activityStatusOrder.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`aiActivity.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable columns={columns} rows={entries ?? []} loading={isLoading} emptyTitle={t("common.noResults")} />
      )}
    </>
  );
}
