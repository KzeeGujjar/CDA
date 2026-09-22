"use client";

import { Bot, User } from "lucide-react";
import { cn } from "@/utils";
import { useMockStream } from "@/hooks/use-mock-stream";
import { MarketplaceListingsGrid } from "./marketplace-listings-grid";
import { AgentToolActivity } from "./agent-tool-activity";
import type { ChatMessage } from "@/types/conversation";

export function ChatMessageBubble({
  message,
  streaming = false,
  onDecide,
}: {
  message: ChatMessage;
  streaming?: boolean;
  onDecide?: (actionId: string, decision: "approve" | "reject") => Promise<void>;
}) {
  const isUser = message.role === "user";
  const revealed = useMockStream(message.content, streaming && !isUser);

  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}>
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            isUser ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
          )}
        >
          {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
        </div>
        <div
          className={cn(
            "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          )}
        >
          {revealed}
        </div>
      </div>
      {!isUser && message.toolCalls && <AgentToolActivity toolCalls={message.toolCalls} onDecide={onDecide} />}
      {!isUser && message.listings && <MarketplaceListingsGrid listings={message.listings} />}
    </div>
  );
}
