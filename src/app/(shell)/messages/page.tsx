"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { ChannelSidebar } from "@/components/messages/channel-sidebar";
import { ConversationList } from "@/components/messages/conversation-list";
import { ConversationThread } from "@/components/messages/conversation-thread";
import { getConversations, markConversationRead } from "@/services/messages";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Conversation, MessageChannel } from "@/types/message";

export default function MessagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<MessageChannel | "all">("all");
  const [search, setSearch] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const {
    data: allConversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["conversations"], queryFn: () => getConversations() });

  const filtered = allConversations.filter((c) => {
    if (activeChannel !== "all" && c.channel !== activeChannel) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${c.contactName} ${c.lastMessagePreview}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeConversation = allConversations.find((c) => c.id === activeConversationId) ?? filtered[0] ?? null;

  function handleSelect(conversation: Conversation) {
    setActiveConversationId(conversation.id);
    if (conversation.unreadCount > 0) {
      markConversationRead(conversation.id).then(() => queryClient.invalidateQueries({ queryKey: ["conversations"] }));
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[calc(100svh-8rem)] flex-col gap-4">
        <PageHeader title={t("messages.title")} subtitle={t("messages.subtitle")} />
        <LoadingState className="flex-1" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[calc(100svh-8rem)] flex-col gap-4">
        <PageHeader title={t("messages.title")} subtitle={t("messages.subtitle")} />
        <div className="flex flex-1 items-center justify-center">
          <ErrorState onRetry={() => refetch()} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col gap-4">
      <PageHeader title={t("messages.title")} subtitle={t("messages.subtitle")} />
      <div className="grid flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border md:grid-cols-[160px_280px_1fr]">
        <ChannelSidebar conversations={allConversations} activeChannel={activeChannel} onSelectChannel={setActiveChannel} />

        <div className="flex flex-col overflow-hidden border-e border-border">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="ps-8" />
            </div>
          </div>
          <ConversationList conversations={filtered} activeId={activeConversation?.id ?? null} onSelect={handleSelect} />
        </div>

        {activeConversation ? (
          <ConversationThread key={activeConversation.id} conversation={activeConversation} />
        ) : (
          <div className="flex items-center justify-center">
            <EmptyState icon={Inbox} title={t("common.noResults")} />
          </div>
        )}
      </div>
    </div>
  );
}
