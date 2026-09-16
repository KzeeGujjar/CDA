import type { StatusTone } from "@/components/shared/status-badge";
import type { LeadStage } from "@/types/lead";

export function leadStageTone(stage: LeadStage): StatusTone {
  switch (stage) {
    case "new":
      return "info";
    case "contacted":
      return "neutral";
    case "qualified":
      return "warning";
    case "viewing":
      return "warning";
    case "negotiation":
      return "warning";
    case "won":
      return "success";
    case "lost":
      return "danger";
  }
}

export function leadScoreTone(score: number): StatusTone {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "neutral";
}

export const leadStageOrder: LeadStage[] = ["new", "contacted", "qualified", "viewing", "negotiation", "won", "lost"];
