import type { CustomerCall, CustomerMessage, CustomerNote, CustomerTask, CustomerTimelineEvent } from "@/types/customer";
import type { Deal } from "@/types/deal";
import type { Lead } from "@/types/lead";

export function buildCustomerTimeline({
  customerId,
  leads,
  deals,
  notes,
  tasks,
  messages,
  calls,
}: {
  customerId: string;
  leads: Lead[];
  deals: Deal[];
  notes: CustomerNote[];
  tasks: CustomerTask[];
  messages: CustomerMessage[];
  calls: CustomerCall[];
}): CustomerTimelineEvent[] {
  const events: CustomerTimelineEvent[] = [];

  for (const lead of leads) {
    events.push({
      id: `tl-lead-${lead.id}`,
      customerId,
      type: "lead_created",
      label: "Lead created",
      detail: lead.interestedVehicleLabel ? `Interested in ${lead.interestedVehicleLabel}` : undefined,
      createdAt: lead.createdAt,
    });
  }

  for (const deal of deals) {
    events.push({
      id: `tl-deal-${deal.id}`,
      customerId,
      type: "deal_created",
      label: `Deal ${deal.reference} created`,
      detail: deal.vehicleLabel,
      createdAt: deal.createdAt,
    });
    if (deal.updatedAt !== deal.createdAt) {
      events.push({
        id: `tl-deal-status-${deal.id}`,
        customerId,
        type: "deal_status_changed",
        label: `Deal ${deal.reference} status updated`,
        detail: deal.status.replace(/_/g, " "),
        createdAt: deal.updatedAt,
      });
    }
  }

  for (const n of notes) {
    events.push({ id: `tl-note-${n.id}`, customerId, type: "note", label: `Note by ${n.authorName}`, detail: n.body, createdAt: n.createdAt });
  }

  for (const t of tasks) {
    events.push({
      id: `tl-task-${t.id}`,
      customerId,
      type: t.status === "completed" ? "task_completed" : "task_created",
      label: t.status === "completed" ? `Task completed: ${t.title}` : `Task created: ${t.title}`,
      detail: `Assigned to ${t.assignedToName}`,
      createdAt: t.createdAt,
    });
  }

  for (const m of messages) {
    events.push({
      id: `tl-msg-${m.id}`,
      customerId,
      type: "message",
      label: `${m.direction === "inbound" ? "Received" : "Sent"} ${m.channel} message`,
      detail: m.body,
      createdAt: m.createdAt,
    });
  }

  for (const c of calls) {
    events.push({
      id: `tl-call-${c.id}`,
      customerId,
      type: "call",
      label: `${c.direction === "inbound" ? "Inbound" : "Outbound"} call — ${c.outcome.replace(/_/g, " ")}`,
      detail: c.summary,
      createdAt: c.createdAt,
    });
  }

  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
