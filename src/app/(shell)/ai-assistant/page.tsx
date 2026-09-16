"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { ChatThreadList } from "@/components/ai/chat-thread-list";
import { ChatWindow } from "@/components/ai/chat-window";
import { AiContextPanel } from "@/components/ai/ai-context-panel";
import { getChatThreads, createChatThread, sendChatMessage, appendAssistantReply } from "@/services/ai-assistant";
import { useAiChatStore } from "@/store/use-ai-chat-store";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { activeThreadId, setActiveThreadId, isStreaming, setStreaming } = useAiChatStore();
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [customerId, setCustomerId] = useState("");

  const { data: threads = [] } = useQuery({ queryKey: ["chat-threads"], queryFn: getChatThreads });

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) setActiveThreadId(threads[0].id);
  }, [activeThreadId, threads, setActiveThreadId]);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      let threadId = activeThreadId;
      if (!threadId) {
        const thread = await createChatThread(text);
        threadId = thread.id;
        setActiveThreadId(threadId);
      } else {
        await sendChatMessage(threadId, text);
      }
      await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      setStreaming(true);
      const { thread, reply } = await appendAssistantReply(threadId);
      const assistantMessage = thread.messages[thread.messages.length - 1];
      setStreamingMessageId(assistantMessage.id);
      await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      setStreaming(false);
      setTimeout(() => setStreamingMessageId(null), reply.length * 12 + 300);
    },
  });

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col gap-4">
      <PageHeader title={t("aiAssistant.title")} subtitle={t("aiAssistant.subtitle")} />
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto xl:flex-row xl:overflow-hidden">
        <div className="grid flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border md:grid-cols-[260px_1fr]">
          <ChatThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelect={setActiveThreadId}
            onNewThread={() => setActiveThreadId(null)}
          />
          <ChatWindow
            thread={activeThread}
            awaitingReply={isStreaming}
            streamingMessageId={streamingMessageId}
            onSend={(text) => sendMutation.mutate(text)}
          />
        </div>
        <div className="xl:overflow-y-auto">
          <AiContextPanel
            vehicleId={vehicleId}
            onVehicleChange={setVehicleId}
            customerId={customerId}
            onCustomerChange={setCustomerId}
          />
        </div>
      </div>
    </div>
  );
}
