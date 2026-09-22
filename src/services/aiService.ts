import type { ID } from "@/types/common";
import type { ChatThread } from "@/types/conversation";
import { chatThreadsFixture, isMarketplaceInventoryRequest, buildMarketplaceReply } from "@/mock/ai-conversations";
import { getMarketplaceListings } from "@/services/marketplaceService";
import { aiService } from "@/services/aiEngineService";
import type { ChatMessage, ChatToolCall } from "@/types/conversation";
import { backendMode, backendRequest, unwrapBackend } from "@/services/backend";

let threads: ChatThread[] = [...chatThreadsFixture];
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Two modes, decided by whether the server knows who is signed in (see services/backend.ts):
 *  - live: the conversation runs on the server-side AI agent, which only sees what this user may see;
 *  - demo: the built-in sample conversations below (no session, or no backend on this deployment).
 */

// ─── live mode: server DTOs → the shapes the UI already renders ───
interface ConversationDto {
  id: string;
  title: string;
  lastMessageAt: string | null;
  createdAt: string;
}
interface MessageDto {
  id: string;
  role: string;
  status: string;
  content: string;
  createdAt: string;
  toolCalls?: ChatToolCall[];
}
interface AgentTurnDto {
  assistantMessage: MessageDto;
}

const unwrap = unwrapBackend;

const toThread = (c: ConversationDto, messages: ChatMessage[] = []): ChatThread => ({
  id: c.id,
  title: c.title,
  lastMessagePreview: messages[messages.length - 1]?.content.slice(0, 80) ?? "",
  updatedAt: c.lastMessageAt ?? c.createdAt,
  messages,
});

const toChatMessage = (m: MessageDto): ChatMessage => ({
  id: m.id,
  role: m.role === "user" ? "user" : "assistant",
  content: m.content,
  createdAt: m.createdAt,
  ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
});

const shownRoles = new Set(["user", "assistant"]);

export async function getChatThreads(): Promise<ChatThread[]> {
  if ((await backendMode()) === "live") {
    const { items } = unwrap(await backendRequest<{ items: ConversationDto[] }>("GET", "/ai/conversations"));
    return items.map((c) => toThread(c));
  }
  await wait();
  return threads;
}

export async function getChatThreadById(id: ID): Promise<ChatThread | null> {
  if ((await backendMode()) === "live") {
    const result = await backendRequest<ConversationDto & { messages: MessageDto[] }>(
      "GET",
      `/ai/conversations/${encodeURIComponent(id)}`
    );
    if (result.kind === "error" && result.error.status === 404) return null;
    const data = unwrap(result);
    return toThread(
      data,
      data.messages.filter((m) => shownRoles.has(m.role) && (m.content || m.toolCalls?.length)).map(toChatMessage)
    );
  }
  await wait(100);
  return threads.find((t) => t.id === id) ?? null;
}

/**
 * Sends one message and returns the assistant's answer. In live mode the server creates the conversation when
 * there is none yet, runs the agent (which may look things up or PROPOSE actions) and stores everything.
 */
export async function sendToAssistant(
  threadId: ID | null,
  text: string
): Promise<{ threadId: ID; assistantMessageId: ID; reply: string }> {
  if ((await backendMode()) === "live") {
    let id = threadId;
    if (!id) id = unwrap(await backendRequest<ConversationDto>("POST", "/ai/conversations", {})).id;
    const turn = unwrap(
      await backendRequest<AgentTurnDto>("POST", `/ai/agent/conversations/${encodeURIComponent(id)}/messages`, {
        content: text,
      })
    );
    return { threadId: id, assistantMessageId: turn.assistantMessage.id, reply: turn.assistantMessage.content };
  }
  let id = threadId;
  if (!id) id = (await createChatThread(text)).id;
  else await sendChatMessage(id, text);
  const { thread, reply } = await appendAssistantReply(id);
  return { threadId: id, assistantMessageId: thread.messages[thread.messages.length - 1].id, reply };
}

/** Approve or reject something the agent proposed. The server re-checks the user's permissions when approving. */
export async function decideAgentAction(actionId: ID, decision: "approve" | "reject"): Promise<void> {
  unwrap(await backendRequest("POST", `/ai/agent/actions/${encodeURIComponent(actionId)}/decision`, { decision }));
}

export async function createChatThread(firstMessage: string): Promise<ChatThread> {
  await wait();
  const thread: ChatThread = {
    id: `thread-${Math.random().toString(36).slice(2, 9)}`,
    title: firstMessage.slice(0, 40),
    lastMessagePreview: firstMessage,
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: `m-${Math.random().toString(36).slice(2, 9)}`,
        role: "user",
        content: firstMessage,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  threads = [thread, ...threads];
  return thread;
}

export async function sendChatMessage(threadId: ID, content: string): Promise<ChatThread> {
  const index = threads.findIndex((t) => t.id === threadId);
  if (index === -1) throw new Error("Thread not found");
  const userMessage = {
    id: `m-${Math.random().toString(36).slice(2, 9)}`,
    role: "user" as const,
    content,
    createdAt: new Date().toISOString(),
  };
  threads[index] = {
    ...threads[index],
    messages: [...threads[index].messages, userMessage],
    lastMessagePreview: content,
    updatedAt: new Date().toISOString(),
  };
  return threads[index];
}

export async function appendAssistantReply(threadId: ID): Promise<{ thread: ChatThread; reply: string }> {
  const index = threads.findIndex((t) => t.id === threadId);
  if (index === -1) throw new Error("Thread not found");
  const lastUserMessage = [...threads[index].messages].reverse().find((m) => m.role === "user");
  const prompt = lastUserMessage?.content ?? "";

  if (isMarketplaceInventoryRequest(prompt)) {
    const listings = await getMarketplaceListings(prompt);
    const reply = buildMarketplaceReply(listings.length);
    const assistantMessage = {
      id: `m-${Math.random().toString(36).slice(2, 9)}`,
      role: "assistant" as const,
      content: reply,
      createdAt: new Date().toISOString(),
      listings,
    };
    threads[index] = {
      ...threads[index],
      messages: [...threads[index].messages, assistantMessage],
      lastMessagePreview: reply,
      updatedAt: new Date().toISOString(),
    };
    return { thread: threads[index], reply };
  }

  const { content: reply } = await aiService.complete({ prompt });
  const assistantMessage = {
    id: `m-${Math.random().toString(36).slice(2, 9)}`,
    role: "assistant" as const,
    content: reply,
    createdAt: new Date().toISOString(),
  };
  threads[index] = {
    ...threads[index],
    messages: [...threads[index].messages, assistantMessage],
    lastMessagePreview: reply,
    updatedAt: new Date().toISOString(),
  };
  return { thread: threads[index], reply };
}
