import { getPlatformDb } from "@/server/db/clients";
import { PENDING_UPLOAD_TTL_HOURS } from "@/server/storage/file-rules";
import { getObjectStorage, type ObjectStorage } from "@/server/storage/object-storage";

/**
 * Housekeeping that crosses organizations, so it uses the platform database client (it is not reachable
 * from any HTTP route; run it from a scheduled job or `npm run storage:maintenance`):
 *   1. Uploads that were started but never completed within PENDING_UPLOAD_TTL_HOURS: the object (if any
 *      arrived) is removed and the row retired.
 *   2. Deleted files whose object could not be removed at the time (Storage was down): removal is retried.
 * Each step is idempotent, so running it twice, or concurrently, is safe.
 */
export interface MaintenanceResult {
  abandonedUploads: number;
  retriedRemovals: number;
  failures: number;
}

const BATCH = 200;

export async function runStorageMaintenance(
  options: { now?: Date; storage?: ObjectStorage } = {}
): Promise<MaintenanceResult> {
  const db = getPlatformDb();
  const storage = options.storage ?? getObjectStorage();
  const now = options.now ?? new Date();
  const result: MaintenanceResult = { abandonedUploads: 0, retriedRemovals: 0, failures: 0 };

  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_TTL_HOURS * 3_600_000);
  const abandoned = await db.storedFile.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, bucket: true, objectPath: true },
    take: BATCH,
  });
  for (const file of abandoned) {
    try {
      await storage.removeObjects(file.bucket, [file.objectPath]);
      await db.storedFile.update({
        where: { id: file.id },
        data: { status: "DELETED", deletedAt: now, objectRemoved: true },
      });
      result.abandonedUploads++;
    } catch {
      result.failures++;
    }
  }

  const stuck = await db.storedFile.findMany({
    where: { status: "DELETED", objectRemoved: false },
    select: { id: true, bucket: true, objectPath: true },
    take: BATCH,
  });
  for (const file of stuck) {
    try {
      await storage.removeObjects(file.bucket, [file.objectPath]);
      await db.storedFile.update({ where: { id: file.id }, data: { objectRemoved: true } });
      result.retriedRemovals++;
    } catch {
      result.failures++;
    }
  }
  return result;
}
