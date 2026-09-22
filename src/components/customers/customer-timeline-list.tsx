"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Calendar, FileText, Handshake, ListChecks, MessageCircle, Phone, StickyNote, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getLeadsByCustomerId } from "@/services/leadService";
import { getDealsByCustomerId } from "@/services/dealService";
import { getCustomerCalls, getCustomerMessages, getCustomerNotes, getCustomerTasks } from "@/services/customerService";
import { buildCustomerTimeline } from "@/lib/customer-timeline";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { CustomerTimelineEventType } from "@/types/customer";
import { InlineError } from "@/components/shared/inline-state";

const eventIcon: Record<CustomerTimelineEventType, LucideIcon> = {
  lead_created: Users,
  lead_stage_changed: Users,
  deal_created: Handshake,
  deal_status_changed: Handshake,
  note: StickyNote,
  message: MessageCircle,
  call: Phone,
  task_created: ListChecks,
  task_completed: ListChecks,
  document_uploaded: FileText,
};

export function CustomerTimelineList({ customerId }: { customerId: string }) {
  const { t, locale } = useTranslation();
  const {
    data: leads = [],
    isLoading: l1,
    error: x1,
    refetch: r1,
  } = useQuery({
    queryKey: ["leads", "by-customer", customerId],
    queryFn: () => getLeadsByCustomerId(customerId),
  });
  const {
    data: deals = [],
    isLoading: l2,
    error: x2,
    refetch: r2,
  } = useQuery({
    queryKey: ["deals", "by-customer", customerId],
    queryFn: () => getDealsByCustomerId(customerId),
  });
  const {
    data: notes = [],
    isLoading: l3,
    error: x3,
    refetch: r3,
  } = useQuery({
    queryKey: ["customer-notes", customerId],
    queryFn: () => getCustomerNotes(customerId),
  });
  const {
    data: tasks = [],
    isLoading: l4,
    error: x4,
    refetch: r4,
  } = useQuery({
    queryKey: ["customer-tasks", customerId],
    queryFn: () => getCustomerTasks(customerId),
  });
  const {
    data: messages = [],
    isLoading: l5,
    error: x5,
    refetch: r5,
  } = useQuery({
    queryKey: ["customer-messages", customerId],
    queryFn: () => getCustomerMessages(customerId),
  });
  const {
    data: calls = [],
    isLoading: l6,
    error: x6,
    refetch: r6,
  } = useQuery({
    queryKey: ["customer-calls", customerId],
    queryFn: () => getCustomerCalls(customerId),
  });

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6;
  const failure = x1 ?? x2 ?? x3 ?? x4 ?? x5 ?? x6;
  const retryAll = () => [r1, r2, r3, r4, r5, r6].forEach((r) => r());

  const events = useMemo(
    () => buildCustomerTimeline({ customerId, leads, deals, notes, tasks, messages, calls }),
    [customerId, leads, deals, notes, tasks, messages, calls]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (failure) return <InlineError error={failure} onRetry={retryAll} />;

  if (events.length === 0) return <EmptyState icon={Calendar} title={t("common.noResults")} />;

  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => {
        const Icon = eventIcon[event.type];
        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-3.5" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 border-b border-border pb-4">
              <span className="text-sm font-medium text-foreground">{event.label}</span>
              {event.detail && <span className="text-sm text-muted-foreground">{event.detail}</span>}
              <span className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
