/**
 * Runs every background maintenance job in one call (storage cleanup, task reminders, message retries) — the
 * same thing GET /api/v1/internal/maintenance-jobs does, without needing a running server or CRON_SECRET.
 * Useful for local testing and for any scheduler that would rather run a script than call an HTTP endpoint.
 * See docs section 0.28.
 *
 *   npm run jobs:run
 *
 * Needs DATABASE_URL and DIRECT_DATABASE_URL.
 */
import { runMaintenanceJobs } from "@/server/platform/run-maintenance-jobs";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

runMaintenanceJobs()
  .then((result) => {
    console.log(`Maintenance jobs finished in ${result.durationMs}ms:`);
    console.log(`  storage:  ${JSON.stringify(result.storage)}`);
    console.log(`  tasks:    ${JSON.stringify(result.tasks)}`);
    console.log(`  messages: ${JSON.stringify(result.messages)}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Maintenance jobs failed:", (error as Error).message);
    process.exit(1);
  });
