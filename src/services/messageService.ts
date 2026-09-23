import type { ID } from "@/types/common";
import type { Conversation, ConversationFilters, ConversationMessage, MessageChannel } from "@/types/message";
import { conversationMessagesFixture, conversationsFixture } from "@/mock/conversations";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

/**
 * The unified inbox (whatsapp, email, sms, website_chat, ai_agent). Connected to /api/v1/messages: with a real
 * session, conversations and messages are the real internal model (§0.20), sent through a real channel adapter
 * (src/server/messaging/providers/*) chosen server-side — the frontend never knows or cares which provider is
 * behind a channel. Without a session, the built-in demo data is used, exactly as before.
 */
const conversations: Conversation[] = [...conversationsFixture];
let messages: ConversationMessage[] = [...conversationMessagesFixture];

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

async function demoGetConversations(filters?: ConversationFilters): Promise<Conversation[]> {
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

async function demoGetConversationMessages(conversationId: ID): Promise<ConversationMessage[]> {
  await wait(200);
  return messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function demoSendConversationMessage(conversationId: ID, body: string): Promise<ConversationMessage> {
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

async function demoMarkConversationRead(conversationId: ID): Promise<Conversation> {
  await wait(100);
  const index = conversations.findIndex((c) => c.id === conversationId);
  if (index === -1) throw new Error("Conversation not found");
  conversations[index] = { ...conversations[index], unreadCount: 0 };
  return conversations[index];
}

// ─────────────────────────────────────────── live ───────────────────────────────────────────

interface ConversationDto {
  id: string;
  channel: string;
  customerId: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  contactName: string;
  contactHandle: string;
  aiHandling: boolean;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}
interface ConversationListDto {
  items: ConversationDto[];
  total: number;
  page: number;
  pageSize: number;
}
interface MessageDto {
  id: string;
  conversationId: string;
  direction: string;
  status: string;
  body: string;
  sentById: string | null;
  sentByName: string | null;
  errorCode: string | null;
  createdAt: string;
}

function toConversation(d: ConversationDto): Conversation {
  return {
    id: d.id,
    channel: d.channel as MessageChannel,
    contactName: d.contactName,
    customerId: d.customerId ?? undefined,
    // Never null in practice (every conversation here starts with a message), but the type promises a string.
    lastMessagePreview: d.lastMessagePreview ?? "",
    lastMessageAt: d.lastMessageAt ?? d.createdAt,
    unreadCount: d.unreadCount,
  };
}

function toMessage(d: MessageDto): ConversationMessage {
  return {
    id: d.id,
    conversationId: d.conversationId,
    direction: d.direction as ConversationMessage["direction"],
    body: d.body,
    createdAt: d.createdAt,
  };
}

function filterQuery(filters?: ConversationFilters): string {
  const q = new URLSearchParams();
  if (filters?.channel) q.set("channel", filters.channel);
  if (filters?.search) q.set("search", filters.search);
  // Large enough for a real dealership's inbox; the page itself filters/searches client-side on top of this.
  q.set("pageSize", "100");
  return `?${q.toString()}`;
}

async function liveGetConversations(filters?: ConversationFilters): Promise<Conversation[]> {
  const dto = unwrapBackend(
    await backendRequest<ConversationListDto>("GET", `/messages/conversations${filterQuery(filters)}`)
  );
  return dto.items.map(toConversation);
}

async function liveGetConversationMessages(conversationId: ID): Promise<ConversationMessage[]> {
  const dtos = unwrapBackend(
    await backendRequest<MessageDto[]>("GET", `/messages/conversations/${conversationId}/messages`)
  );
  return dtos.map(toMessage);
}

async function liveSendConversationMessage(conversationId: ID, body: string): Promise<ConversationMessage> {
  const dto = unwrapBackend(
    await backendRequest<MessageDto>("POST", `/messages/conversations/${conversationId}/messages`, { body })
  );
  return toMessage(dto);
}

async function liveMarkConversationRead(conversationId: ID): Promise<Conversation> {
  const dto = unwrapBackend(
    await backendRequest<ConversationDto>("PATCH", `/messages/conversations/${conversationId}`, { markRead: true })
  );
  return toConversation(dto);
}

// ─────────────────────────────────────────── exported ───────────────────────────────────────────

export function getConversations(filters?: ConversationFilters): Promise<Conversation[]> {
  return liveOrDemo({ live: () => liveGetConversations(filters), demo: () => demoGetConversations(filters) });
}

export function getConversationMessages(conversationId: ID): Promise<ConversationMessage[]> {
  return liveOrDemo({
    live: () => liveGetConversationMessages(conversationId),
    demo: () => demoGetConversationMessages(conversationId),
  });
}

export function sendConversationMessage(conversationId: ID, body: string): Promise<ConversationMessage> {
  return liveOrDemo({
    live: () => liveSendConversationMessage(conversationId, body),
    demo: () => demoSendConversationMessage(conversationId, body),
  });
}

export function markConversationRead(conversationId: ID): Promise<Conversation> {
  return liveOrDemo({
    live: () => liveMarkConversationRead(conversationId),
    demo: () => demoMarkConversationRead(conversationId),
  });
}

/**
 * Starts a new conversation with a customer on whatsapp, email or sms, given the message to open with. Real
 * send through that channel's adapter server-side; no demo equivalent (there is no UI to start one from yet —
 * see docs/BACKEND_ARCHITECTURE.md §0.20), so this only works with a real session.
 */
export async function startConversation(input: {
  channel: "whatsapp" | "email" | "sms";
  customerId: ID;
  body: string;
}): Promise<Conversation> {
  const dto = unwrapBackend(await backendRequest<ConversationDto>("POST", "/messages/conversations", input));
  return toConversation(dto);
}
