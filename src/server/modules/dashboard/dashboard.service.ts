import { z } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { can, requirePermission, scopeFilter, type ScopeFilter } from "@/server/auth/authorize";
import type { PermissionScope } from "@/server/auth/permission-catalog";
import { withTenant, type TenantDb } from "@/server/db/tenant";

/**
 * Dashboard numbers. Every figure is computed by a PostgreSQL function (migration dashboard_functions),
 * so the server never loads vehicles, leads or deals to count them. This module only:
 *   1. checks the caller's permission and turns their scope into function arguments,
 *   2. decides whether cost / profit figures may be computed at all (profit:read),
 *   3. shapes the (metric, value, previous) rows into a response with a change figure.
 * The organization is never an argument: the functions read it from the transaction (set from the session).
 */

// ── request ─────────────────────────────────────────────────────────────────────────────────────

export const periodPresets = ["month", "last30", "last90", "ytd", "custom"] as const;
export type PeriodPreset = (typeof periodPresets)[number];

const MAX_CUSTOM_DAYS = 731;
const dayMs = 24 * 60 * 60 * 1000;

/** `period` picks a preset; `custom` also needs `from` and `to` (YYYY-MM-DD, inclusive). Unknown keys are a 400. */
export const periodQuerySchema = z
  .strictObject({
    period: z.enum(periodPresets).default("month"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.period !== "custom") {
      if (q.from || q.to)
        ctx.addIssue({ code: "custom", path: ["period"], message: "from/to are only allowed with period=custom." });
      return;
    }
    if (!q.from || !q.to) {
      ctx.addIssue({ code: "custom", path: ["period"], message: "period=custom needs both from and to." });
      return;
    }
    const days = (Date.parse(q.to) - Date.parse(q.from)) / dayMs;
    if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], message: "to must not be before from." });
    else if (days > MAX_CUSTOM_DAYS - 1)
      ctx.addIssue({ code: "custom", path: ["to"], message: `The period cannot exceed ${MAX_CUSTOM_DAYS} days.` });
  });
export type PeriodQuery = z.infer<typeof periodQuerySchema>;

export const salesTrendQuerySchema = z.strictObject({
  months: z.coerce.number().int().min(1).max(36).default(6),
});

const parse = <T>(schema: z.ZodType<T>, query: URLSearchParams): T => schema.parse(Object.fromEntries(query.entries()));

// ── response ────────────────────────────────────────────────────────────────────────────────────

export interface Metric {
  value: number | null;
  /** The same measure for the comparison period (see PeriodDto). */
  previous: number | null;
  /**
   * How much it moved. percent = relative change; points = percentage-point difference (used for rates).
   * null when there is nothing to compare with (no data, or the previous value was 0).
   */
  change: number | null;
  changeUnit: "percent" | "points";
}

export interface PeriodDto {
  preset: PeriodPreset;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timezone: string;
}

interface Common {
  period: PeriodDto;
  /** ISO 4217 code of every monetary figure (the organization base currency). */
  currency: string;
  /** How far the caller's role reaches: the numbers cover only that slice. */
  scope: PermissionScope;
}

export interface InventoryKpisDto extends Common {
  totalVehicles: Metric;
  availableVehicles: Metric;
  vehiclesPurchased: Metric;
  expectedRevenue: Metric;
  /** Stock at cost. null unless the caller also holds profit:read. */
  inventoryValue: Metric | null;
}

export interface SalesKpisDto extends Common {
  vehiclesSold: Metric;
  /** Revenue excluding VAT: the "Monthly sales" figure. */
  monthlySales: Metric;
  /** null unless the caller also holds profit:read. */
  grossProfit: Metric | null;
}

export interface LeadKpisDto extends Common {
  newLeads: Metric;
  wonLeads: Metric;
  conversionRate: Metric;
}

export interface SalesTrendDto {
  currency: string;
  timezone: string;
  scope: PermissionScope;
  months: {
    /** First day of the month, YYYY-MM-DD. */
    month: string;
    vehiclesSold: number;
    revenue: number;
    /** null unless the caller also holds profit:read. */
    grossProfit: number | null;
  }[];
}

// ── plumbing ────────────────────────────────────────────────────────────────────────────────────

interface MetricRow {
  metric: string;
  value: number | null;
  previous: number | null;
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

function toMetric(rows: MetricRow[], name: string, unit: Metric["changeUnit"] = "percent"): Metric {
  const row = rows.find((r) => r.metric === name);
  const value = row?.value ?? null;
  const previous = row?.previous ?? null;
  let change: number | null = null;
  if (value !== null && previous !== null) {
    if (unit === "points") change = round(value - previous);
    else if (previous !== 0) change = round(((value - previous) / previous) * 100);
  }
  return { value, previous, change, changeUnit: unit };
}

const iso = (d: Date) => d.toISOString();

interface Resolved {
  timezone: string;
  currency: string;
  bounds: { period_start: Date; period_end: Date; prev_start: Date; prev_end: Date };
  period: PeriodDto;
}

async function resolvePeriod(db: TenantDb, q: PeriodQuery): Promise<Resolved> {
  const org = await db.organization.findFirstOrThrow({ select: { timezone: true, currency: true } });
  const [bounds] = await db.$queryRaw<Resolved["bounds"][]>`
    SELECT * FROM dashboard_period_bounds(${q.period}, ${org.timezone}, ${q.from ?? null}::date, ${q.to ?? null}::date)`;
  return {
    timezone: org.timezone,
    currency: org.currency,
    bounds,
    period: {
      preset: q.period,
      from: iso(bounds.period_start),
      to: iso(bounds.period_end),
      previousFrom: iso(bounds.prev_start),
      previousTo: iso(bounds.prev_end),
      timezone: org.timezone,
    },
  };
}

// ── endpoints' services ─────────────────────────────────────────────────────────────────────────

/** Total / available / purchased vehicles, expected revenue and (with profit:read) inventory value. Needs vehicles:read. */
export async function getInventoryKpis(ctx: AuthContext, query: URLSearchParams): Promise<InventoryKpisDto> {
  const scope = requirePermission(ctx, "vehicles", "read");
  const q = parse(periodQuerySchema, query);
  const { branchIds }: ScopeFilter = scopeFilter(ctx, scope, { branchField: "branchId" });
  const includeCost = can(ctx, "profit", "read");

  return withTenant(ctx, async (db) => {
    const r = await resolvePeriod(db, q);
    const rows = await db.$queryRaw<MetricRow[]>`
      SELECT * FROM dashboard_stock_kpis(
        ${r.bounds.period_start}::timestamptz, ${r.bounds.period_end}::timestamptz,
        ${r.bounds.prev_start}::timestamptz, ${r.bounds.prev_end}::timestamptz,
        ${branchIds}::text[], ${includeCost}::boolean)`;
    return {
      period: r.period,
      currency: r.currency,
      scope,
      totalVehicles: toMetric(rows, "total_vehicles"),
      availableVehicles: toMetric(rows, "available_vehicles"),
      vehiclesPurchased: toMetric(rows, "vehicles_purchased"),
      expectedRevenue: toMetric(rows, "expected_revenue"),
      inventoryValue: includeCost ? toMetric(rows, "inventory_value") : null,
    };
  });
}

/** Vehicles sold, sales revenue and (with profit:read) gross profit. Needs sales:read; "own" scope sees only their deals. */
export async function getSalesKpis(ctx: AuthContext, query: URLSearchParams): Promise<SalesKpisDto> {
  const scope = requirePermission(ctx, "sales", "read");
  const q = parse(periodQuerySchema, query);
  const { branchIds, ownerId } = scopeFilter(ctx, scope, { ownerField: "salespersonId", branchField: "branchId" });
  const includeProfit = can(ctx, "profit", "read");

  return withTenant(ctx, async (db) => {
    const r = await resolvePeriod(db, q);
    const rows = await db.$queryRaw<MetricRow[]>`
      SELECT * FROM dashboard_sales_kpis(
        ${r.bounds.period_start}::timestamptz, ${r.bounds.period_end}::timestamptz,
        ${r.bounds.prev_start}::timestamptz, ${r.bounds.prev_end}::timestamptz,
        ${branchIds}::text[], ${ownerId}::text, ${includeProfit}::boolean)`;
    return {
      period: r.period,
      currency: r.currency,
      scope,
      vehiclesSold: toMetric(rows, "vehicles_sold"),
      monthlySales: toMetric(rows, "sales_revenue"),
      grossProfit: includeProfit ? toMetric(rows, "gross_profit") : null,
    };
  });
}

/** New leads and conversion rate. Needs leads:read; "own" scope sees only leads assigned to them. */
export async function getLeadKpis(ctx: AuthContext, query: URLSearchParams): Promise<LeadKpisDto> {
  const scope = requirePermission(ctx, "leads", "read");
  const q = parse(periodQuerySchema, query);
  const { branchIds, ownerId } = scopeFilter(ctx, scope, { ownerField: "assignedToId", branchField: "branchId" });

  return withTenant(ctx, async (db) => {
    const r = await resolvePeriod(db, q);
    const rows = await db.$queryRaw<MetricRow[]>`
      SELECT * FROM dashboard_lead_kpis(
        ${r.bounds.period_start}::timestamptz, ${r.bounds.period_end}::timestamptz,
        ${r.bounds.prev_start}::timestamptz, ${r.bounds.prev_end}::timestamptz,
        ${branchIds}::text[], ${ownerId}::text)`;
    return {
      period: r.period,
      currency: r.currency,
      scope,
      newLeads: toMetric(rows, "new_leads"),
      wonLeads: toMetric(rows, "won_leads"),
      conversionRate: toMetric(rows, "conversion_rate", "points"),
    };
  });
}

/** Sales per calendar month for the last N months (zero-filled, oldest first). Needs sales:read. */
export async function getSalesTrend(ctx: AuthContext, query: URLSearchParams): Promise<SalesTrendDto> {
  const scope = requirePermission(ctx, "sales", "read");
  const { months } = parse(salesTrendQuerySchema, query);
  const { branchIds, ownerId } = scopeFilter(ctx, scope, { ownerField: "salespersonId", branchField: "branchId" });
  const includeProfit = can(ctx, "profit", "read");

  return withTenant(ctx, async (db) => {
    const org = await db.organization.findFirstOrThrow({ select: { timezone: true, currency: true } });
    const rows = await db.$queryRaw<
      { month_start: Date; vehicles_sold: number; revenue: number; gross_profit: number | null }[]
    >`
      SELECT * FROM dashboard_monthly_sales(
        ${months}::integer, ${org.timezone}, ${branchIds}::text[], ${ownerId}::text, ${includeProfit}::boolean)`;
    return {
      currency: org.currency,
      timezone: org.timezone,
      scope,
      months: rows.map((row) => ({
        month: row.month_start.toISOString().slice(0, 10),
        vehiclesSold: row.vehicles_sold,
        revenue: row.revenue,
        grossProfit: includeProfit ? row.gross_profit : null,
      })),
    };
  });
}
