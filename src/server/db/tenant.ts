import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { tenantExtension } from "./tenant-extension";
import { getAppDb } from "./clients";

/** A Prisma client that can only see and change ONE organization's data. */
export type TenantDb = Prisma.TransactionClient;

interface RunOptions {
  /**
   * Tests/tools that connect as the table owner set this to "cda_app" so RLS applies to them.
   * In production the app already connects as cda_app, so it stays undefined.
   */
  assumeRole?: string;
  timeoutMs?: number;
}

/**
 * Runs `fn` inside a transaction that is confined to `organizationId` at BOTH layers:
 *   1. Postgres:    `app.org_id` is set (transaction-local) so Row-Level Security filters every row;
 *   2. Application: the tenant extension injects/validates organizationId on every operation.
 *
 * `organizationId` must come from the authenticated session (see AuthContext), never from a request.
 */
export async function runInTenant<T>(
  db: PrismaClient,
  organizationId: string,
  fn: (tenantDb: TenantDb) => Promise<T>,
  options: RunOptions = {}
): Promise<T> {
  const scoped = db.$extends(tenantExtension(organizationId));
  return scoped.$transaction(
    async (tx) => {
      if (options.assumeRole) {
        if (!/^[a-z_][a-z0-9_]*$/.test(options.assumeRole)) throw new Error("invalid role name");
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${options.assumeRole}`);
      }
      await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
      return fn(tx as unknown as TenantDb);
    },
    { timeout: options.timeoutMs ?? 10_000 }
  );
}

/** Feature-code entry point: the organization comes from the authenticated context. */
export function withTenant<T>(ctx: { organizationId: string }, fn: (tenantDb: TenantDb) => Promise<T>): Promise<T> {
  return runInTenant(getAppDb(), ctx.organizationId, fn);
}
