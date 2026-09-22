import type { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/server/env";
import { createPrismaClient } from "./client";

/**
 * Two deliberately different clients:
 *
 *  - appDb      connects as `cda_app` (RLS applies). The ONLY client feature code may reach, and only
 *               through withTenant() in ./tenant.ts, which scopes it to one organization.
 *  - platformDb connects as the table owner (bypasses RLS). For the few operations that happen before
 *               a tenant is known (resolving a session token) or that legitimately span tenants
 *               (provisioning). Importing it is restricted by an ESLint rule to src/server/auth,
 *               src/server/platform and the DB layer itself.
 *
 * Cached on globalThis so dev hot-reload does not open a new pool on every edit.
 */
const globalForDb = globalThis as unknown as { __cdaAppDb?: PrismaClient; __cdaPlatformDb?: PrismaClient };

/**
 * Prisma's pg adapter treats timestamps as UTC wall-clock time and does not convert, so a database whose
 * TimeZone is not UTC silently stores shifted instants. The migration `database_timezone_utc` fixes the
 * database default; this is the loud, once-per-process alarm for a database where that could not be applied.
 */
function warnIfNotUtc(db: PrismaClient, label: string) {
  db.$queryRaw<{ TimeZone: string }[]>`SHOW timezone`
    .then(([row]) => {
      if (row && !/^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/i.test(row.TimeZone)) {
        console.error(
          `[db] ${label}: the database TimeZone is "${row.TimeZone}" but must be UTC, otherwise stored timestamps are wrong. ` +
            `Run: ALTER DATABASE <name> SET timezone TO 'UTC';`
        );
      }
    })
    .catch(() => undefined);
}

export function getAppDb(): PrismaClient {
  if (!globalForDb.__cdaAppDb) {
    globalForDb.__cdaAppDb = createPrismaClient(serverEnv().DATABASE_URL);
    warnIfNotUtc(globalForDb.__cdaAppDb, "app connection");
  }
  return globalForDb.__cdaAppDb;
}

export function getPlatformDb(): PrismaClient {
  if (!globalForDb.__cdaPlatformDb) {
    globalForDb.__cdaPlatformDb = createPrismaClient(serverEnv().DIRECT_DATABASE_URL);
    warnIfNotUtc(globalForDb.__cdaPlatformDb, "platform connection");
  }
  return globalForDb.__cdaPlatformDb;
}
