import type { ID } from "./common";
import type { MarketplaceListing } from "./marketplace";

export type MessageRole = "user" | "assistant";

/** What the AI agent did (or proposes to do) while answering, as reported by the server. */
export interface ChatToolCall {
  id: ID;
  /** searchVehicles, getInventory, createTask, ... */
  tool: string;
  /** ok | error | denied | awaiting_confirmation | executed | rejected | expired */
  status: string;
  /** For a proposal: what will happen if the user approves it. */
  summary: string | null;
  requiresApproval: boolean;
}

export interface ChatMessage {
  id: ID;
  role: MessageRole;
  content: string;
  createdAt: string;
  listings?: MarketplaceListing[];
  toolCalls?: ChatToolCall[];
}

export interface ChatThread {
  id: ID;
  title: string;
  lastMessagePreview: string;
  updatedAt: string;
  messages: ChatMessage[];
}
