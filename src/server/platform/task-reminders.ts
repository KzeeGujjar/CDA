import { getPlatformDb } from "@/server/db/clients";

/**
 * Task reminders (§0.23): for every open task whose remind_at has passed and has not been reminded about yet,
 * writes a real in-app notification (the bell in the top bar) to its assignee, then marks it reminded so a
 * run started twice, or concurrently, never double-notifies. Crosses organizations, so it uses the platform
 * client (not reachable from any HTTP route; run it from a scheduled job or `npm run tasks:remind`) — the
 * same shape src/server/platform/storage-maintenance.ts already uses. Idempotent; safe to run any time.
 */
export interface TaskReminderResult {
  reminded: number;
}

const BATCH = 200;

export async function runTaskReminders(options: { now?: Date } = {}): Promise<TaskReminderResult> {
  const db = getPlatformDb();
  const now = options.now ?? new Date();

  const due = await db.task.findMany({
    where: { status: "OPEN", remindAt: { lte: now }, remindedAt: null },
    select: { id: true, organizationId: true, title: true, assignedToId: true, createdById: true },
    take: BATCH,
  });
  if (!due.length) return { reminded: 0 };

  let reminded = 0;
  for (const task of due) {
    await db.$transaction([
      db.notification.create({
        data: {
          organizationId: task.organizationId,
          userId: task.assignedToId ?? task.createdById,
          kind: "SYSTEM",
          title: "Task reminder",
          description: task.title,
          link: "/tasks",
        },
      }),
      db.task.update({ where: { id: task.id }, data: { remindedAt: now } }),
    ]);
    reminded++;
  }
  return { reminded };
}
