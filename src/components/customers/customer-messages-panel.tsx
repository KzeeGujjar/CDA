"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/utils";
import { addCustomerMessage, getCustomerMessages } from "@/services/customers";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { CustomerMessageChannel } from "@/types/customer";

const channels: CustomerMessageChannel[] = ["whatsapp", "email", "sms"];

export function CustomerMessagesPanel({ customerId }: { customerId: string }) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<CustomerMessageChannel>("whatsapp");
  const [body, setBody] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["customer-messages", customerId],
    queryFn: () => getCustomerMessages(customerId),
  });

  const mutation = useMutation({
    mutationFn: () => addCustomerMessage(customerId, channel, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-messages", customerId] });
      setBody("");
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-2/3" />
          ))}
        </div>
      ) : !messages || messages.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t("common.noResults")} />
      ) : (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[80%] flex-col gap-0.5 rounded-lg px-3 py-2 text-sm",
                m.direction === "outbound" ? "self-end bg-primary/10 text-foreground" : "self-start bg-muted text-foreground"
              )}
            >
              <span>{m.body}</span>
              <span className="text-[11px] text-muted-foreground">
                {t(`customers.channels.${m.channel}`)} · {new Date(m.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
        <Select value={channel} onValueChange={(v) => setChannel(v as CustomerMessageChannel)}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`customers.channels.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          rows={1}
          placeholder={t("customers.sendMessage")}
          aria-label={t("customers.sendMessage")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-9 flex-1 resize-none"
        />
        <Button
          size="icon-sm"
          disabled={body.trim().length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
          aria-label={t("common.send")}
        >
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
