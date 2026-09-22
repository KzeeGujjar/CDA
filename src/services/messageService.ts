import type { ID } from "@/types/common";
import type { Conversation, ConversationFilters, ConversationMessage } from "@/types/message";
import { conversationMessagesFixture, conversationsFixture } from "@/mock/conversations";

const conversations: Conversation[] = [...conversationsFixture];
let messages: ConversationMessage[] = [...conversationMessagesFixture];

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getConversations(filters?: ConversationFilters): Promise<Conversation[]> {
  await wait();
  return conversations
    .filter((c) => {
      if (filters?.channel && c.channel !== filters.channel) return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        if (!`${c.contactName} ${c.lastMessagePreview}`.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function getConversationMessages(conversationId: ID): Promise<ConversationMessage[]> {
  await wait(200);
  return messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function sendConversationMessage(conversationId: ID, body: string): Promise<ConversationMessage> {
  await wait();
  const created: ConversationMessage = {
    id: `${conversationId}-msg-${Math.random().toString(36).slice(2, 9)}`,
    conversationId,
    direction: "outbound",
    body,
    createdAt: new Date().toISOString(),
  };
  messages = [...messages, created];
  const index = conversations.findIndex((c) => c.id === conversationId);
  if (index !== -1) {
    conversations[index] = {
      ...conversations[index],
      lastMessagePreview: body,
      lastMessageAt: created.createdAt,
      unreadCount: 0,
    };
  }
  return created;
}

export async function markConversationRead(conversationId: ID): Promise<Conversation> {
  await wait(100);
  const index = conversations.findIndex((c) => c.id === conversationId);
  if (index === -1) throw new Error("Conversation not found");
  conversations[index] = { ...conversations[index], unreadCount: 0 };
  return conversations[index];
}
