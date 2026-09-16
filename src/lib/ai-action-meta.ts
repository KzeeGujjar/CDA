import { FileSearch, FileText, Gauge, Languages, LineChart, Megaphone, MessageSquare, Target, BellRing, type LucideIcon } from "lucide-react";
import type { AiActionType } from "@/types/ai-activity";

export const aiActionMeta: Record<AiActionType, { icon: LucideIcon; labelKey: string }> = {
  valuation: { icon: Gauge, labelKey: "valuation" },
  lead_scoring: { icon: Target, labelKey: "leadScoring" },
  marketing_content: { icon: Megaphone, labelKey: "marketingContent" },
  document_generation: { icon: FileText, labelKey: "documentGeneration" },
  document_translation: { icon: Languages, labelKey: "documentTranslation" },
  document_summary: { icon: FileSearch, labelKey: "documentSummary" },
  price_analysis: { icon: LineChart, labelKey: "priceAnalysis" },
  chat_response: { icon: MessageSquare, labelKey: "chatResponse" },
  follow_up_suggestion: { icon: BellRing, labelKey: "followUpSuggestion" },
};

export const aiActionTypes: AiActionType[] = [
  "valuation",
  "lead_scoring",
  "marketing_content",
  "document_generation",
  "document_translation",
  "document_summary",
  "price_analysis",
  "chat_response",
  "follow_up_suggestion",
];
