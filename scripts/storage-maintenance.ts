/**
 * Storage housekeeping: removes uploads that were never completed and retries object removals that failed.
 * Safe to run any time, any number of times. Schedule it (for example daily); see docs section 0.8.
 *
 *   npm run storage:maintenance
 *
 * Needs DATABASE_URL, DIRECT_DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { runStorageMaintenance } from "@/server/platform/storage-maintenance";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

runStorageMaintenance()
  .then((result) => {
    console.log(
      `Storage maintenance: ${result.abandonedUploads} abandoned uploads removed, ${result.retriedRemovals} removals retried, ${result.failures} failures.`
    );
    process.exit(result.failures ? 1 : 0);
  })
  .catch((error) => {
    console.error("Storage maintenance failed:", (error as Error).message);
    process.exit(1);
  });
