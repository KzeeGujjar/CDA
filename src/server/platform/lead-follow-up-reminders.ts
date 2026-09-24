import { getPlatformDb } from "@/server/db/clients";

/**
 * Follow-up reminders (§27): for every lead whose next_follow_up_at has passed and has not been reminded about
 * yet, writes a real in-app notification to its assignee, then marks it reminded so a run started twice, or
 * concurrently, never double-notifies. Crosses organizations, so it uses the platform client (not reachable
 * from any HTTP route; run it from a scheduled job or `npm run followups:remind`) — the same shape
 * src/server/platform/task-reminders.ts already uses. Idempotent; safe to run any time.
 */
export interface FollowUpReminderResult {
  reminded: number;
}

const BATCH = 200;

export async function runLeadFollowUpReminders(options: { now?: Date } = {}): Promise<FollowUpReminderResult> {
  const db = getPlatformDb();
  const now = options.now ?? new Date();

  const due = await db.lead.findMany({
    where: { nextFollowUpAt: { lte: now }, followUpRemindedAt: null, assignedToId: { not: null } },
    select: { id: true, organizationId: true, assignedToId: true, customer: { select: { name: true } } },
    take: BATCH,
  });
  if (!due.length) return { reminded: 0 };

  let reminded = 0;
  for (const lead of due) {
    await db.$transaction([
      db.notification.create({
        data: {
          organizationId: lead.organizationId,
          userId: lead.assignedToId!,
          kind: "LEAD",
          title: "Follow-up reminder",
          description: lead.customer.name,
          link: `/leads/${lead.id}`,
        },
      }),
      db.lead.update({ where: { id: lead.id }, data: { followUpRemindedAt: now } }),
    ]);
    reminded++;
  }
  return { reminded };
}
