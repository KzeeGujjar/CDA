import type { DealershipTask } from "@/types/task";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface TaskBuckets {
  overdue: DealershipTask[];
  today: DealershipTask[];
  upcoming: DealershipTask[];
  completed: DealershipTask[];
}

export function groupTasksByBucket(tasks: DealershipTask[]): TaskBuckets {
  const todayStart = startOfDay(new Date());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const buckets: TaskBuckets = { overdue: [], today: [], upcoming: [], completed: [] };

  for (const task of tasks) {
    if (task.status === "completed") {
      buckets.completed.push(task);
      continue;
    }
    const due = new Date(task.dueAt);
    if (due < todayStart) buckets.overdue.push(task);
    else if (due < tomorrowStart) buckets.today.push(task);
    else buckets.upcoming.push(task);
  }

  buckets.overdue.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  buckets.today.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  buckets.upcoming.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  buckets.completed.sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));

  return buckets;
}
