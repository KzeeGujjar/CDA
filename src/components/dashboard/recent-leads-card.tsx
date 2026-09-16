"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { getLeads } from "@/services/leads";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { leadStageTone } from "@/components/leads/lead-stage";

export function RecentLeadsCard() {
  const { t } = useTranslation();
  const { data: leads, isLoading } = useQuery({ queryKey: ["leads", "recent"], queryFn: () => getLeads() });
  const recent = [...(leads ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("dashboard.recentLeads")}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/leads">{t("common.viewAll")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        {recent.map((lead) => (
          <Link
            key={lead.id}
            href={`/leads/${lead.id}`}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
          >
            <Avatar className="size-8">
              <AvatarImage src={lead.customerAvatarUrl} alt={lead.customerName} />
              <AvatarFallback>{lead.customerName.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{lead.customerName}</span>
              <span className="truncate text-xs text-muted-foreground">{lead.interestedVehicleLabel}</span>
            </div>
            <StatusBadge label={t(`leads.stages.${lead.stage}`)} tone={leadStageTone(lead.stage)} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
