"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getMessages } from "@/services/notificationService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function MessagesMenu() {
  const { t } = useTranslation();
  const { data: messages = [] } = useQuery({ meta: { banner: true }, queryKey: ["messages"], queryFn: getMessages });
  const unreadCount = messages.filter((m) => m.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `${t("nav.messages")} (${unreadCount})` : t("nav.messages")}
        >
          <MessageSquare className="size-4.5" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute top-1 end-1 flex size-2 rounded-full bg-accent" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("nav.messages")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {messages.map((m) => (
            <Link key={m.id} href="/messages" className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted">
              <span
                className="mt-0.5 size-1.5 shrink-0 rounded-full"
                data-unread={m.unread}
                style={{ backgroundColor: m.unread ? "var(--primary)" : "transparent" }}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{m.customerName}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{m.preview}</span>
              </div>
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
