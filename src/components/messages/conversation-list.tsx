"use client";

import { Inbox } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { messageChannelMeta } from "@/lib/message-channel-meta";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { Conversation } from "@/types/message";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
}) {
  const { t, locale } = useTranslation();

  if (conversations.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={Inbox} title={t("common.noResults")} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {conversations.map((c) => {
        const meta = messageChannelMeta[c.channel];
        const Icon = meta.icon;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className={cn(
              "flex items-start gap-2.5 border-b border-border px-3 py-3 text-start transition-colors hover:bg-muted/50",
              activeId === c.id && "bg-muted"
            )}
          >
            <div className="relative shrink-0">
              <Avatar className="size-9">
                <AvatarImage src={c.contactAvatarUrl} alt={c.contactName} />
                <AvatarFallback>{c.contactName.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full bg-background">
                <Icon className={cn("size-2.5", meta.tone)} />
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("truncate text-sm text-foreground", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                  {c.contactName}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(c.lastMessageAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">{c.lastMessagePreview}</span>
                {c.unreadCount > 0 && (
                  <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {c.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
