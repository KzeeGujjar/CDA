"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getLeads } from "@/services/leadService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { InlineError } from "@/components/shared/inline-state";

export function UpcomingFollowUpsCard() {
  const { t, locale } = useTranslation();
  const {
    data: leads,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["leads", "followups"], queryFn: () => getLeads() });
  const upcoming = [...(leads ?? [])]
    .filter((l) => l.nextFollowUpAt)
    .sort((a, b) => (a.nextFollowUpAt ?? "").localeCompare(b.nextFollowUpAt ?? ""))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.upcomingFollowUps")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        {isError && <InlineError error={error} onRetry={() => refetch()} />}
        {!isLoading && !isError && upcoming.length === 0 && (
          <EmptyState icon={CalendarClock} title={t("common.noResults")} />
        )}
        {upcoming.map((lead) => (
          <Link
            key={lead.id}
            href={`/leads/${lead.id}`}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
          >
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{lead.customerName}</span>
              <span className="truncate text-xs text-muted-foreground">{lead.assignedToName}</span>
            </div>
            <span className="shrink-0 text-xs font-medium text-primary">
              {new Date(lead.nextFollowUpAt!).toLocaleString(locale, {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
