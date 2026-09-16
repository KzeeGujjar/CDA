import type { ID, Money } from "./common";

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "viewing"
  | "negotiation"
  | "won"
  | "lost";

export type LeadSource =
  | "website"
  | "walk_in"
  | "referral"
  | "social_media"
  | "marketplace"
  | "phone";

export interface LeadInteraction {
  id: ID;
  type: "call" | "whatsapp" | "email" | "visit" | "note";
  summary: string;
  createdAt: string;
  authorName: string;
}

export interface Lead {
  id: ID;
  customerId: ID;
  customerName: string;
  customerAvatarUrl?: string;
  customerPhone: string;
  customerEmail: string;
  interestedVehicleId?: ID;
  interestedVehicleLabel?: string;
  budget?: Money;
  stage: LeadStage;
  source: LeadSource;
  score: number;
  assignedToName: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
  interactions: LeadInteraction[];
}

export interface LeadFilters {
  search?: string;
  stage?: LeadStage;
  assignedToName?: string;
}

export interface LeadInput {
  customerId: ID;
  interestedVehicleId?: ID;
  budget?: Money;
  source: LeadSource;
  assignedToName: string;
}
