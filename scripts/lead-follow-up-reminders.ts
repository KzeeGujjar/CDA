/**
 * Sends a real in-app notification for every lead whose follow-up time has passed. Safe to run any time, any
 * number of times. Schedule it (for example every few minutes); see docs section 27.
 *
 *   npm run followups:remind
 *
 * Needs DATABASE_URL and DIRECT_DATABASE_URL.
 */
import { runLeadFollowUpReminders } from "@/server/platform/lead-follow-up-reminders";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

runLeadFollowUpReminders()
  .then((result) => {
    console.log(`Follow-up reminders: ${result.reminded} notification(s) sent.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Follow-up reminders failed:", (error as Error).message);
    process.exit(1);
  });
