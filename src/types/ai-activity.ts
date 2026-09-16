import type { ID } from "./common";

export type AiActionType =
  | "valuation"
  | "lead_scoring"
  | "marketing_content"
  | "document_generation"
  | "document_translation"
  | "document_summary"
  | "price_analysis"
  | "chat_response"
  | "follow_up_suggestion";

export type AiActivityStatus = "completed" | "in_progress" | "needs_review" | "failed";

export interface AiActivityEntry {
  id: ID;
  timestamp: string;
  action: AiActionType;
  vehicleLabel?: string;
  customerName?: string;
  result: string;
  status: AiActivityStatus;
}

export interface AiActivityFilters {
  search?: string;
  status?: AiActivityStatus;
  action?: AiActionType;
}

export interface AiActivitySummary {
  totalActions: number;
  completed: number;
  needsReview: number;
  timeSavedHours: number;
}
