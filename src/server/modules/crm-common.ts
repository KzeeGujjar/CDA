import { z, type ZodType } from "zod";

/** Helpers shared by the vehicles, customers and leads modules. */

/** An opaque record id (ULID or the platform's fixed ids); never used to build anything but a lookup. */
export const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "is not a valid id");

/** A NUMERIC(14,2) value as a JavaScript number (2 decimals fit a double exactly enough for display and sums). */
export const money = (value: { toString(): string }): number => Math.round(Number(value.toString()) * 100) / 100;

/** DB enum value (UPPER_SNAKE) to the API's lower-case spelling. */
export const toEnum = (value: string) => value.toLowerCase();

export const page = <T>(items: T[], total: number, pageNumber: number, pageSize: number) => ({
  items,
  total,
  page: pageNumber,
  pageSize,
});

/** Parses a query string with a strict schema: an unknown or out-of-range parameter is a 400 (ZodError). */
export const parseQuery = <T>(schema: ZodType<T>, query: URLSearchParams): T =>
  schema.parse(Object.fromEntries(query.entries()));

/** The calendar day (as a whole number of days since 1970-01-01) of an instant, in an IANA time zone. */
export function dayInZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(instant)
    .split("-")
    .map(Number);
  return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86_400_000);
}

/**
 * Makes user text safe to use inside a LIKE / ILIKE pattern: "%" and "_" are wildcards there, and Prisma's
 * `contains` does not escape them, so a search for "%" would match everything. Backslash is PostgreSQL's escape.
 */
export const likeSafe = (text: string): string => text.replace(/[\\%_]/g, (c) => "\\" + c);
