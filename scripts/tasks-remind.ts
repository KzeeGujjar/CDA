/**
 * Sends a real in-app notification for every open task whose reminder time has passed. Safe to run any time,
 * any number of times. Schedule it (for example every few minutes); see docs section 0.23.
 *
 *   npm run tasks:remind
 *
 * Needs DATABASE_URL and DIRECT_DATABASE_URL.
 */
import { runTaskReminders } from "@/server/platform/task-reminders";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

runTaskReminders()
  .then((result) => {
    console.log(`Task reminders: ${result.reminded} notification(s) sent.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Task reminders failed:", (error as Error).message);
    process.exit(1);
  });
