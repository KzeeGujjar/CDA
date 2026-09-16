import { LeadCard } from "./lead-card";
import { leadStageTone } from "./lead-stage";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/components/shared/currency";
import type { Lead, LeadStage } from "@/types/lead";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function PipelineColumn({
  stage,
  leads,
  onStageChange,
}: {
  stage: LeadStage;
  leads: Lead[];
  onStageChange: (leadId: string, stage: LeadStage) => void;
}) {
  const { t } = useTranslation();
  const totalBudget = leads.reduce((sum, l) => sum + (l.budget?.amount ?? 0), 0);

  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 rounded-xl bg-muted/40 p-3">
      <div className="flex items-center justify-between px-1">
        <StatusBadge label={t(`leads.stages.${stage}`)} tone={leadStageTone(stage)} />
        <span className="text-xs text-muted-foreground">{leads.length}</span>
      </div>
      {totalBudget > 0 && (
        <div className="px-1 text-xs text-muted-foreground">
          {t("leads.fields.pipelineValue")}: <span className="font-medium text-foreground">{formatMoney({ amount: totalBudget, currency: "AED" })}</span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onStageChange={(s) => onStageChange(lead.id, s)} />
        ))}
      </div>
    </div>
  );
}
