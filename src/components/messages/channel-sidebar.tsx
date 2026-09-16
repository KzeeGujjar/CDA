"use client";

import { Inbox } from "lucide-react";
import { messageChannelMeta, messageChannels } from "@/lib/message-channel-meta";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { Conversation, MessageChannel } from "@/types/message";

export function ChannelSidebar({
  conversations,
  activeChannel,
  onSelectChannel,
}: {
  conversations: Conversation[];
  activeChannel: MessageChannel | "all";
  onSelectChannel: (channel: MessageChannel | "all") => void;
}) {
  const { t } = useTranslation();

  function unreadFor(channel: MessageChannel | "all") {
    return conversations.filter((c) => channel === "all" || c.channel === channel).reduce((sum, c) => sum + c.unreadCount, 0);
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto border-e border-border p-2">
      <button
        type="button"
        onClick={() => onSelectChannel("all")}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
          activeChannel === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
        )}
      >
        <Inbox className="size-4 shrink-0" />
        <span className="flex-1 truncate text-start">{t("messages.allChannels")}</span>
        {unreadFor("all") > 0 && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {unreadFor("all")}
          </span>
        )}
      </button>

      {messageChannels.map((channel) => {
        const meta = messageChannelMeta[channel];
        const Icon = meta.icon;
        const unread = unreadFor(channel);
        const isActive = activeChannel === channel;
        return (
          <button
            key={channel}
            type="button"
            onClick={() => onSelectChannel(channel)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className={cn("size-4 shrink-0", !isActive && meta.tone)} />
            <span className="flex-1 truncate text-start">{t(`messages.channels.${meta.labelKey}`)}</span>
            {unread > 0 && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
