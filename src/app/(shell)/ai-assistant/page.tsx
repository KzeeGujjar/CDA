"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ChatThreadList } from "@/components/ai/chat-thread-list";
import { ChatWindow } from "@/components/ai/chat-window";
import { AiContextPanel } from "@/components/ai/ai-context-panel";
import { decideAgentAction, getChatThreadById, getChatThreads, sendToAssistant } from "@/services/aiService";
import { useAiChatStore } from "@/store/use-ai-chat-store";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ChatThread } from "@/types/conversation";
import { ErrorState } from "@/components/shared/error-state";
import { notifyError } from "@/lib/errors/notify";

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { activeThreadId, setActiveThreadId, isStreaming, setStreaming } = useAiChatStore();
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  // The message being sent is shown at once, before the server has answered.
  const [sendingText, setSendingText] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [customerId, setCustomerId] = useState("");

  const {
    data: threads = [],
    error: threadsError,
    refetch: refetchThreads,
  } = useQuery({ queryKey: ["chat-threads"], queryFn: getChatThreads });
  const { data: detail } = useQuery({
    meta: { banner: true },
    queryKey: ["chat-thread", activeThreadId],
    queryFn: () => getChatThreadById(activeThreadId as string),
    enabled: !!activeThreadId,
  });

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) setActiveThreadId(threads[0].id);
  }, [activeThreadId, threads, setActiveThreadId]);

  const stored = detail ?? threads.find((thread) => thread.id === activeThreadId) ?? null;
  const now = new Date().toISOString();
  const activeThread: ChatThread | null =
    sendingText === null
      ? stored
      : {
          id: stored?.id ?? "sending",
          title: stored?.title ?? sendingText.slice(0, 40),
          lastMessagePreview: sendingText,
          updatedAt: now,
          messages: [
            ...(stored?.messages ?? []),
            { id: "sending", role: "user", content: sendingText, createdAt: now },
          ],
        };

  const refresh = (threadId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] }),
      queryClient.fetchQuery({
        queryKey: ["chat-thread", threadId],
        queryFn: () => getChatThreadById(threadId),
        staleTime: 0,
      }),
    ]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      setSendingText(text);
      setStreaming(true);
      try {
        const { threadId, assistantMessageId, reply } = await sendToAssistant(activeThreadId, text);
        await refresh(threadId);
        setActiveThreadId(threadId);
        setStreamingMessageId(assistantMessageId);
        setTimeout(() => setStreamingMessageId(null), reply.length * 12 + 300);
      } finally {
        setSendingText(null);
        setStreaming(false);
      }
    },
    onError: (error) => notifyError(error, { title: t("aiAssistant.agent.failed") }),
  });

  const decide = async (actionId: string, decision: "approve" | "reject") => {
    try {
      await decideAgentAction(actionId, decision);
      toast.success(t(decision === "approve" ? "aiAssistant.agent.approved" : "aiAssistant.agent.rejected"));
    } catch (error) {
      notifyError(error, { title: t("aiAssistant.agent.failed") });
    }
    if (activeThreadId) await refresh(activeThreadId);
  };

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col gap-4">
      <PageHeader title={t("aiAssistant.title")} subtitle={t("aiAssistant.subtitle")} />
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto xl:flex-row xl:overflow-hidden">
        <div className="grid flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border md:grid-cols-[260px_1fr]">
          {threadsError ? (
            <div className="flex items-center justify-center p-6 md:col-span-2">
              <ErrorState error={threadsError} onRetry={() => refetchThreads()} />
            </div>
          ) : (
            <>
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
                onDecide={decide}
              />
            </>
          )}
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
