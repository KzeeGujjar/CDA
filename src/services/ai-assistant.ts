import type { ID } from "@/types/common";
import type { ChatThread } from "@/types/conversation";
import { chatThreadsFixture, isMarketplaceInventoryRequest, buildMarketplaceReply } from "@/mock/ai-conversations";
import { getMarketplaceListings } from "@/services/marketplace";
import { aiService } from "@/lib/ai/ai-service";

let threads: ChatThread[] = [...chatThreadsFixture];
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getChatThreads(): Promise<ChatThread[]> {
  await wait();
  return threads;
}

export async function getChatThreadById(id: ID): Promise<ChatThread | null> {
  await wait(100);
  return threads.find((t) => t.id === id) ?? null;
}

export async function createChatThread(firstMessage: string): Promise<ChatThread> {
  await wait();
  const thread: ChatThread = {
    id: `thread-${Math.random().toString(36).slice(2, 9)}`,
    title: firstMessage.slice(0, 40),
    lastMessagePreview: firstMessage,
    updatedAt: new Date().toISOString(),
    messages: [{ id: `m-${Math.random().toString(36).slice(2, 9)}`, role: "user", content: firstMessage, createdAt: new Date().toISOString() }],
  };
  threads = [thread, ...threads];
  return thread;
}

export async function sendChatMessage(threadId: ID, content: string): Promise<ChatThread> {
  const index = threads.findIndex((t) => t.id === threadId);
  if (index === -1) throw new Error("Thread not found");
  const userMessage = { id: `m-${Math.random().toString(36).slice(2, 9)}`, role: "user" as const, content, createdAt: new Date().toISOString() };
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
  const assistantMessage = { id: `m-${Math.random().toString(36).slice(2, 9)}`, role: "assistant" as const, content: reply, createdAt: new Date().toISOString() };
  threads[index] = {
    ...threads[index],
    messages: [...threads[index].messages, assistantMessage],
    lastMessagePreview: reply,
    updatedAt: new Date().toISOString(),
  };
  return { thread: threads[index], reply };
}
