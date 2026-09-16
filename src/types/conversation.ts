import type { ID } from "./common";
import type { MarketplaceListing } from "./marketplace";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: ID;
  role: MessageRole;
  content: string;
  createdAt: string;
  listings?: MarketplaceListing[];
}

export interface ChatThread {
  id: ID;
  title: string;
  lastMessagePreview: string;
  updatedAt: string;
  messages: ChatMessage[];
}
