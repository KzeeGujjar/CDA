import { AppError } from "./errors";

/**
 * Turns a database failure into a safe, classified API error. The raw errors carry the host and port, table and
 * constraint names and sometimes the SQL itself, so none of that text ever reaches a client: the response says what
 * KIND of problem it is (the user's data, a conflict with existing records, or the database being unavailable) and
 * whether trying again can help.
 *
 *   503 database_unavailable  cannot connect / too many connections / shutting down   (Retry-After: 5)
 *   503 database_busy         deadlock, serialization failure, lock or statement timeout (Retry-After: 1)
 *   409 conflict              unique or foreign-key violation
 *   409 business_rule         a rule enforced by a database trigger (its message is ours, so it is shown)
 *   400 validation_error      a value the column cannot hold (too long, wrong type, check constraint, not null)
 *   404 not_found             the record to change does not exist
 *
 * Returns null for anything that is not a database error, and for database errors it does not recognise (those stay
 * a generic 500 and are logged with the request id).
 */

interface PrismaLikeError {
  name?: string;
  code?: string;
  meta?: {
    code?: string;
    driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string; kind?: string } };
  };
}

export interface DatabaseErrorInfo {
  /** Prisma code (P2002 ...) */
  prismaCode?: string;
  /** PostgreSQL SQLSTATE (23505 ...) */
  sqlState?: string;
  kind?: string;
}

export function describeDatabaseError(error: unknown): DatabaseErrorInfo | null {
  const e = error as PrismaLikeError | null;
  if (!e || typeof e !== "object") return null;
  const isPrisma = typeof e.name === "string" && e.name.startsWith("PrismaClient");
  if (!isPrisma) return null;
  const cause = e.meta?.driverAdapterError?.cause;
  return { prismaCode: e.code, sqlState: cause?.originalCode ?? e.meta?.code, kind: cause?.kind };
}

const UNAVAILABLE_KINDS = new Set([
  "DatabaseNotReachable",
  "ConnectionClosed",
  "TooManyConnections",
  "SocketTimeout",
  "TlsConnectionError",
  "DatabaseDoesNotExist",
  "DatabaseAccessDenied",
  "AuthenticationFailed",
]);
const UNAVAILABLE_PRISMA = new Set(["P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1017", "P2024"]);
const BUSY_PRISMA = new Set(["P2028", "P2034"]);
const BUSY_SQLSTATE = new Set(["40001", "40P01", "55P03", "57014"]);

const unavailable = () =>
  new AppError(503, "database_unavailable", "The service is temporarily unavailable. Please try again in a moment.", {
    "retry-after": "5",
  });
const busy = () =>
  new AppError(503, "database_busy", "The service is busy. Please try again in a moment.", { "retry-after": "1" });

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function mapDatabaseError(error: unknown): AppError | null {
  const info = describeDatabaseError(error);
  if (!info) return null;
  const { prismaCode: p, sqlState: s, kind } = info;
  const sqlClass = s?.slice(0, 2);

  if (
    (kind && UNAVAILABLE_KINDS.has(kind)) ||
    (p && UNAVAILABLE_PRISMA.has(p)) ||
    sqlClass === "08" ||
    sqlClass === "53" ||
    s === "57P01" ||
    s === "57P02" ||
    s === "57P03"
  ) {
    return unavailable();
  }
  if ((p && BUSY_PRISMA.has(p)) || (s && BUSY_SQLSTATE.has(s))) return busy();

  if (p === "P2002" || s === "23505") {
    return new AppError(409, "conflict", "A record with these details already exists.");
  }
  if (p === "P2025") return new AppError(404, "not_found", "Not found.");
  if (s === "23001") {
    // restrict_violation is raised only by our own triggers (for example "a completed deal cannot be changed"),
    // written as a sentence for people, so it is the one database message that is shown.
    const original = (error as PrismaLikeError).meta?.driverAdapterError?.cause?.originalMessage;
    return new AppError(
      409,
      "business_rule",
      original
        ? `${capitalize(original.trim())}${/[.!?]$/.test(original.trim()) ? "" : "."}`
        : "This change is not allowed."
    );
  }
  if (p === "P2003" || s === "23503") {
    return new AppError(409, "conflict", "This record is in use, or refers to a record that does not exist.");
  }
  if (
    p === "P2000" ||
    p === "P2005" ||
    p === "P2006" ||
    p === "P2007" ||
    p === "P2011" ||
    p === "P2012" ||
    p === "P2013" ||
    p === "P2039" ||
    s === "23502" ||
    s === "23514" ||
    sqlClass === "22"
  ) {
    return new AppError(400, "validation_error", "Some of the values are not allowed.");
  }
  return null;
}
