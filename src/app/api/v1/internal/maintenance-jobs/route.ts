import { timingSafeEqual } from "node:crypto";
import { publicRouteV2 } from "@/server/http/api-route";
import { AppError, unauthorized } from "@/server/lib/errors";
import { runMaintenanceJobs } from "@/server/platform/run-maintenance-jobs";

/**
 * The one thing an external scheduler needs to call (§0.28: Background Jobs) to run every maintenance job:
 * storage cleanup, task reminders, message retries. No session exists for a scheduler, so this route is
 * public by design (see PUBLIC_ROUTE_ALLOWLIST) and instead requires CRON_SECRET as a bearer token — the
 * same convention Vercel Cron uses: set CRON_SECRET and Vercel sends it automatically as
 * `Authorization: Bearer <value>` on every invocation of a path listed in vercel.json's "crons".
 * Any other scheduler (or `curl`, for a manual run) sends the same header.
 */
function assertAuthorized(req: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new AppError(503, "not_configured", "CRON_SECRET is not set.");
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized();
}

export const GET = publicRouteV2(async ({ req }) => {
  assertAuthorized(req);
  return runMaintenanceJobs();
});
