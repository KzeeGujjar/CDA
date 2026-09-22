import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Builds a Prisma client for one connection string. Callers decide which credentials to pass:
 *  - the app's tenant client uses DATABASE_URL (the `cda_app` role — Row-Level Security applies);
 *  - migrations, the seed, and the platform/auth client use DIRECT_DATABASE_URL (the owner role).
 */
export function createPrismaClient(connectionString: string, options: { maxConnections?: number } = {}): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: options.maxConnections }) });
}
