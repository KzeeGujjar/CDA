/**
 * Retries FAILED outbound messages once, automatically. Safe to run any time, any number of times. See
 * docs section 0.28.
 *
 *   npm run messages:retry
 *
 * Needs DATABASE_URL and DIRECT_DATABASE_URL.
 */
import { runMessageRetries } from "@/server/platform/message-retries";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

runMessageRetries()
  .then((result) => {
    console.log(`Message retries: ${result.attempted} attempted, ${result.recovered} recovered, ${result.stillFailed} still failed.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Message retries failed:", (error as Error).message);
    process.exit(1);
  });
