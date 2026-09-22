import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessageBubble } from "./chat-message-bubble";
import { ChatComposer } from "./chat-composer";
import { TypingIndicator } from "./typing-indicator";
import { AiSuggestionChip } from "./ai-suggestion-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { Bot } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ChatThread } from "@/types/conversation";

const suggestionKeys = ["summarizeLeads", "draftFollowUp", "agingInventory", "pricingAdvice"] as const;

export function ChatWindow({
  thread,
  awaitingReply,
  streamingMessageId,
  onSend,
  onDecide,
}: {
  thread: ChatThread | null;
  awaitingReply: boolean;
  streamingMessageId: string | null;
  onSend: (text: string) => void;
  onDecide?: (actionId: string, decision: "approve" | "reject") => Promise<void>;
}) {
  const { t } = useTranslation();

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icon={Bot} title={t("aiAssistant.title")} description={t("aiAssistant.subtitle")} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4" role="log" aria-live="polite" aria-relevant="additions">
          {thread.messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              streaming={message.id === streamingMessageId}
              onDecide={onDecide}
            />
          ))}
          {awaitingReply && <TypingIndicator />}
          {thread.messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {suggestionKeys.map((key) => (
                <AiSuggestionChip
                  key={key}
                  label={t(`aiAssistant.suggestions.${key}`)}
                  onClick={() => onSend(t(`aiAssistant.suggestions.${key}`))}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      <ChatComposer disabled={awaitingReply} onSend={onSend} />
    </div>
  );
}
