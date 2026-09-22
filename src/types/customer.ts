import type { ID } from "./common";

export interface Customer {
  id: ID;
  name: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  nationality?: string;
  preferredLanguage?: string;
  address?: string;
  tags: string[];
  createdAt: string;
  /** Total of completed purchases; absent when the signed-in role may not see deals. */
  lifetimeValue?: number;
}

export interface CustomerFilters {
  search?: string;
  tag?: string;
}

export interface CustomerNote {
  id: ID;
  customerId: ID;
  body: string;
  authorName: string;
  createdAt: string;
}

export type CustomerTaskStatus = "open" | "completed";

export interface CustomerTask {
  id: ID;
  customerId: ID;
  title: string;
  dueAt?: string;
  status: CustomerTaskStatus;
  assignedToName: string;
  createdAt: string;
}

export type CustomerDocumentType = "id" | "license" | "contract" | "invoice" | "other";

export interface CustomerDocument {
  id: ID;
  customerId: ID;
  name: string;
  type: CustomerDocumentType;
  sizeLabel: string;
  uploadedAt: string;
}

export type CustomerMessageChannel = "whatsapp" | "email" | "sms";
export type CustomerMessageDirection = "inbound" | "outbound";

export interface CustomerMessage {
  id: ID;
  customerId: ID;
  channel: CustomerMessageChannel;
  direction: CustomerMessageDirection;
  body: string;
  createdAt: string;
}

export type CustomerCallOutcome = "connected" | "no_answer" | "voicemail";
export type CustomerCallDirection = "inbound" | "outbound";

export interface CustomerCall {
  id: ID;
  customerId: ID;
  direction: CustomerCallDirection;
  outcome: CustomerCallOutcome;
  durationMinutes: number;
  summary?: string;
  createdAt: string;
}

export type CustomerTimelineEventType =
  | "lead_created"
  | "lead_stage_changed"
  | "deal_created"
  | "deal_status_changed"
  | "note"
  | "message"
  | "call"
  | "task_created"
  | "task_completed"
  | "document_uploaded";

export interface CustomerTimelineEvent {
  id: ID;
  customerId: ID;
  type: CustomerTimelineEventType;
  label: string;
  detail?: string;
  createdAt: string;
}
