"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { messageChannelMeta } from "@/lib/message-channel-meta";
import { getConversationMessages, sendConversationMessage } from "@/services/messages";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { Conversation } from "@/types/message";

export function ConversationThread({ conversation }: { conversation: Conversation }) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const meta = messageChannelMeta[conversation.channel];
  const Icon = meta.icon;

  const { data: messages, isLoading } = useQuery({
    queryKey: ["conversation-messages", conversation.id],
    queryFn: () => getConversationMessages(conversation.id),
  });

  const mutation = useMutation({
    mutationFn: () => sendConversationMessage(conversation.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", conversation.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setBody("");
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar className="size-9">
          <AvatarImage src={conversation.contactAvatarUrl} alt={conversation.contactName} />
          <AvatarFallback>{conversation.contactName.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{conversation.contactName}</span>
          <span className={cn("flex items-center gap-1 text-xs", meta.tone)}>
            <Icon className="size-3" />
            {t(`messages.channels.${meta.labelKey}`)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3" />)
        ) : (
          messages?.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.direction === "outbound" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted text-foreground"
              )}
            >
              <span>{m.body}</span>
              <div className={cn("mt-1 text-[11px]", m.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {new Date(m.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (body.trim()) mutation.mutate();
            }
          }}
          placeholder={t("messages.replyPlaceholder")}
          aria-label={t("messages.replyPlaceholder")}
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none"
        />
        <Button
          size="icon"
          disabled={!body.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
          aria-label={t("common.send")}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
