import type { ID } from "./common";

export type MessageChannel = "whatsapp" | "email" | "sms" | "website_chat" | "ai_agent";

export interface Conversation {
  id: ID;
  channel: MessageChannel;
  contactName: string;
  contactAvatarUrl?: string;
  customerId?: ID;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ConversationMessage {
  id: ID;
  conversationId: ID;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
}

export interface ConversationFilters {
  channel?: MessageChannel;
  search?: string;
}
