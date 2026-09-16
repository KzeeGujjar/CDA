import type { Lead } from "@/types/lead";

export type LeadClassification = "hot" | "warm" | "cold";

export interface LeadAiScoring {
  score: number;
  classification: LeadClassification;
  purchaseProbabilityPct: number;
}

export function getLeadAiScoring(lead: Lead): LeadAiScoring {
  const score = lead.score;

  if (score >= 80) {
    return { score, classification: "hot", purchaseProbabilityPct: Math.min(97, score + 6) };
  }
  if (score >= 50) {
    return { score, classification: "warm", purchaseProbabilityPct: Math.round(score * 0.78) };
  }
  return { score, classification: "cold", purchaseProbabilityPct: Math.round(score * 0.5) };
}
