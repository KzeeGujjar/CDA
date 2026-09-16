import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/utils";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { ChatThread } from "@/types/conversation";

export function ChatThreadList({
  threads,
  activeThreadId,
  onSelect,
  onNewThread,
}: {
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNewThread: () => void;
}) {
  const { t, locale } = useTranslation();

  return (
    <div className="flex h-full flex-col border-e border-border">
      <div className="p-3">
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onNewThread}>
          <Plus className="size-3.5" />
          {t("aiAssistant.newThread")}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 px-2 pb-3">
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => onSelect(thread.id)}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg px-2.5 py-2.5 text-start transition-colors",
                thread.id === activeThreadId ? "bg-primary/10" : "hover:bg-muted"
              )}
            >
              <span className={cn("truncate text-sm font-medium", thread.id === activeThreadId ? "text-primary" : "text-foreground")}>
                {thread.title}
              </span>
              <span className="truncate text-xs text-muted-foreground">{thread.lastMessagePreview}</span>
              <span className="text-[11px] text-muted-foreground/70">
                {new Date(thread.updatedAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
