import { PipelineColumn } from "@/components/leads/pipeline-column";
import { LoadingState } from "@/components/shared/loading-state";
import { leadStageOrder } from "@/components/leads/lead-stage";
import type { Lead, LeadStage } from "@/types/lead";

export function LeadPipeline({
  leads,
  loading,
  onStageChange,
}: {
  leads: Lead[];
  loading?: boolean;
  onStageChange: (leadId: string, stage: LeadStage) => void;
}) {
  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {leadStageOrder.map((stage) => (
          <LoadingState key={stage} variant="block" className="h-96 w-80 shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {leadStageOrder.map((stage) => (
        <PipelineColumn
          key={stage}
          stage={stage}
          leads={leads.filter((l) => l.stage === stage)}
          onStageChange={onStageChange}
        />
      ))}
    </div>
  );
}
