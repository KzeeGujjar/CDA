import type { StatusTone } from "@/components/shared/status-badge";
import type { AiActivityStatus } from "@/types/ai-activity";

export function activityStatusTone(status: AiActivityStatus): StatusTone {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "needs_review":
      return "warning";
    case "failed":
      return "danger";
  }
}

export const activityStatusOrder: AiActivityStatus[] = ["completed", "in_progress", "needs_review", "failed"];
