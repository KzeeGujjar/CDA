"use client";

import Link from "next/link";
import { Mail, MoreHorizontal, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/components/shared/currency";
import { leadScoreTone, leadStageOrder, leadStageTone } from "./lead-stage";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Lead, LeadStage } from "@/types/lead";

export function LeadCard({ lead, onStageChange }: { lead: Lead; onStageChange: (stage: LeadStage) => void }) {
  const { t, locale } = useTranslation();

  const shortDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "—";

  return (
    <Card className="border-0">
      <CardContent className="flex flex-col gap-2.5 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/leads/${lead.id}`} className="flex items-center gap-2 overflow-hidden">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src={lead.customerAvatarUrl} alt={lead.customerName} />
              <AvatarFallback>{lead.customerName.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{lead.customerName}</span>
              <StatusBadge label={t(`leads.stages.${lead.stage}`)} tone={leadStageTone(lead.stage)} />
            </div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("common.moreActions")}>
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {leadStageOrder.map((stage) => (
                <DropdownMenuItem key={stage} onClick={() => onStageChange(stage)} disabled={stage === lead.stage}>
                  {t(`leads.stages.${stage}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {lead.interestedVehicleLabel && (
          <p className="truncate text-xs text-muted-foreground" title={lead.interestedVehicleLabel}>
            {lead.interestedVehicleLabel}
          </p>
        )}

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 truncate" title={lead.customerPhone}>
            <Phone className="size-3 shrink-0" />
            {lead.customerPhone}
          </span>
          <span className="flex items-center gap-1.5 truncate" title={lead.customerEmail}>
            <Mail className="size-3 shrink-0" />
            {lead.customerEmail}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">{t("leads.fields.budget")}</span>
            <span className="font-medium text-foreground">{lead.budget ? formatMoney(lead.budget) : "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">{t("leads.fields.score")}</span>
            <StatusBadge label={String(lead.score)} tone={leadScoreTone(lead.score)} />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <StatusBadge label={t(`leads.sources.${lead.source}`)} tone="neutral" />
          <span className="truncate text-muted-foreground">{lead.assignedToName}</span>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">{t("leads.fields.lastContact")}</span>
            <span className="text-foreground">{shortDate(lead.lastContactAt)}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-muted-foreground">{t("leads.nextFollowUp")}</span>
            <span className="font-medium text-primary">{shortDate(lead.nextFollowUpAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
