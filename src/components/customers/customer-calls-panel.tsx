"use client";

import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getCustomerCalls } from "@/services/customers";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function CustomerCallsPanel({ customerId }: { customerId: string }) {
  const { t, locale } = useTranslation();
  const { data: calls, isLoading } = useQuery({
    queryKey: ["customer-calls", customerId],
    queryFn: () => getCustomerCalls(customerId),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!calls || calls.length === 0) return <EmptyState icon={Phone} title={t("common.noResults")} />;

  return (
    <div className="flex flex-col gap-3">
      {calls.map((call) => {
        const Icon = call.outcome === "no_answer" ? PhoneMissed : call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
        return (
          <div key={call.id} className="flex items-start gap-3 border-b border-border pb-3 last:border-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-3.5" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{t(`customers.callOutcomes.${call.outcome}`)}</span>
                {call.durationMinutes > 0 && <span className="text-xs text-muted-foreground">{call.durationMinutes} min</span>}
              </div>
              {call.summary && <span className="text-sm text-muted-foreground">{call.summary}</span>}
              <span className="text-xs text-muted-foreground">
                {new Date(call.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
