import { runStorageMaintenance, type MaintenanceResult } from "./storage-maintenance";
import { runTaskReminders, type TaskReminderResult } from "./task-reminders";
import { runMessageRetries, type MessageRetryResult } from "./message-retries";
import { runLeadFollowUpReminders, type FollowUpReminderResult } from "./lead-follow-up-reminders";

/**
 * Runs every background maintenance job (§0.28) in one call: storage cleanup, task reminders, message
 * retries, lead follow-up reminders. This is the ONE thing that needs scheduling — a single Vercel Cron entry
 * hitting /api/v1/internal/maintenance-jobs (or a single `npm run jobs:run` in any other scheduler) covers all
 * of them, so adding one more job later is a one-line addition here, never a new cron entry (exactly what
 * happened when this one was added).
 *
 * Each job runs independently: one throwing does not stop the others, and the failure is reported per job
 * rather than losing the whole run.
 */
export interface MaintenanceJobsResult {
  durationMs: number;
  storage: MaintenanceResult | { error: string };
  tasks: TaskReminderResult | { error: string };
  messages: MessageRetryResult | { error: string };
  leadFollowUps: FollowUpReminderResult | { error: string };
}

async function runJob<T>(name: string, job: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await job();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[maintenance-jobs] ${name} failed:`, message);
    return { error: message };
  }
}

export async function runMaintenanceJobs(options: { now?: Date } = {}): Promise<MaintenanceJobsResult> {
  const started = Date.now();
  const [storage, tasks, messages, leadFollowUps] = await Promise.all([
    runJob("storage maintenance", () => runStorageMaintenance(options)),
    runJob("task reminders", () => runTaskReminders(options)),
    runJob("message retries", () => runMessageRetries(options)),
    runJob("lead follow-up reminders", () => runLeadFollowUpReminders(options)),
  ]);
  return { durationMs: Date.now() - started, storage, tasks, messages, leadFollowUps };
}
