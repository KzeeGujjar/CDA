import { z } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { can, permissionScope, requirePermission, scopeFilter, type ScopeFilter } from "@/server/auth/authorize";
import type { PermissionScope } from "@/server/auth/permission-catalog";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { money } from "@/server/modules/crm-common";

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

// ── one consolidated endpoint (§0.20) ───────────────────────────────────────────────────────────

/**
 * Every dashboard figure in one call, for a page that wants the whole picture without four round trips. Unlike
 * the four endpoints above, this one has no single [resource, action] gate at the door (`composed: true` on
 * its route, see src/server/http/api-route.ts) — an Accountant holds sales:read but not vehicles:read, a
 * Marketing Manager holds neither, and the page should still show whatever slice a role actually has, exactly
 * as it already does when the frontend calls the four endpoints separately and treats a 403 as "leave this
 * slice out" (services/dashboardService.ts's `readIfAllowed`, now done here instead). A slice the caller may
 * not see is `null`, never fabricated, never a reason to fail the whole request.
 */
export interface AiInsightDto {
  id: string;
  kind: "price_trend" | "overpriced" | "resale_potential" | "aging" | "opportunity";
  message: string;
  createdAt: string;
}

export interface DashboardSummaryDto {
  period: PeriodDto;
  currency: string;
  totalVehicles: Metric | null;
  availableVehicles: Metric | null;
  vehiclesPurchased: Metric | null;
  expectedRevenue: Metric | null;
  /** null unless the caller holds vehicles:read AND profit:read. */
  totalInventoryValue: Metric | null;
  vehiclesSold: Metric | null;
  monthlySales: Metric | null;
  /** null unless the caller holds sales:read AND profit:read. */
  grossProfit: Metric | null;
  newLeads: Metric | null;
  conversionRate: Metric | null;
  /** [] unless the caller holds vehicles:read. */
  inventoryAging: { label: string; value: number }[];
  /**
   * Rule-based, computed live from this organization's own vehicles — never an LLM call. Grounded in SQL
   * facts (aging stock, listed price vs this app's own market estimate), the way docs/BACKEND_ARCHITECTURE.md
   * always scoped "AI Insights": a future pass may add an LLM only to phrase these, never to invent the facts.
   * [] unless the caller holds vehicles:read.
   */
  aiInsights: AiInsightDto[];
}

const DAY_MS = 86_400_000;

async function computeInventoryAging(db: TenantDb, branchIds: string[] | null) {
  const rows = await db.vehicle.findMany({
    where: {
      status: { notIn: ["SOLD", "ARCHIVED"] },
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
    },
    select: { acquiredAt: true },
  });
  const now = Date.now();
  const buckets = [
    { label: "0-30 days", min: 0, max: 30 },
    { label: "31-60 days", min: 31, max: 60 },
    { label: "61-90 days", min: 61, max: 90 },
    { label: "90+ days", min: 91, max: Infinity },
  ];
  return buckets.map((b) => ({
    label: b.label,
    value: rows.filter((v) => {
      const days = Math.floor((now - v.acquiredAt.getTime()) / DAY_MS);
      return days >= b.min && days <= b.max;
    }).length,
  }));
}

async function computeAiInsights(db: TenantDb, branchIds: string[] | null): Promise<AiInsightDto[]> {
  const rows = await db.vehicle.findMany({
    where: { status: { in: ["AVAILABLE", "RESERVED"] }, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: { id: true, make: true, model: true, year: true, acquiredAt: true, listPrice: true, estimatedMarketValue: true },
  });
  const now = Date.now();
  const insights: AiInsightDto[] = [];
  const nowIso = new Date().toISOString();

  const aging = rows.filter((v) => (now - v.acquiredAt.getTime()) / DAY_MS > 60);
  if (aging.length > 0) {
    insights.push({
      id: "aging",
      kind: "aging",
      message: `${aging.length} vehicle${aging.length === 1 ? " has" : "s have"} been in stock for over 60 days.`,
      createdAt: nowIso,
    });
  }

  const priced = rows.filter((v) => money(v.estimatedMarketValue ?? 0) > 0);
  const overpriced = priced.filter((v) => money(v.listPrice) > money(v.estimatedMarketValue!) * 1.1);
  if (overpriced.length > 0) {
    const v = overpriced[0];
    insights.push({
      id: "overpriced",
      kind: "overpriced",
      message:
        overpriced.length === 1
          ? `The ${v.year} ${v.make} ${v.model} is listed above its estimated market value.`
          : `${overpriced.length} vehicles are listed above their estimated market value.`,
      createdAt: nowIso,
    });
  }

  const underpriced = priced.filter((v) => money(v.listPrice) < money(v.estimatedMarketValue!) * 0.9);
  if (underpriced.length > 0) {
    insights.push({
      id: "opportunity",
      kind: "opportunity",
      message: `${underpriced.length} vehicle${underpriced.length === 1 ? " is" : "s are"} priced well below estimated market value — room to raise price.`,
      createdAt: nowIso,
    });
  }

  return insights;
}

export async function getDashboardSummary(ctx: AuthContext, query: URLSearchParams): Promise<DashboardSummaryDto> {
  const q = parse(periodQuerySchema, query);
  const includeProfit = can(ctx, "profit", "read");
  const vehiclesScope = can(ctx, "vehicles", "read") ? permissionScope(ctx, "vehicles", "read") : null;
  const salesScope = can(ctx, "sales", "read") ? permissionScope(ctx, "sales", "read") : null;
  const leadsScope = can(ctx, "leads", "read") ? permissionScope(ctx, "leads", "read") : null;

  return withTenant(ctx, async (db) => {
    const r = await resolvePeriod(db, q);
    const bounds = [
      r.bounds.period_start,
      r.bounds.period_end,
      r.bounds.prev_start,
      r.bounds.prev_end,
    ] as const;

    let totalVehicles: Metric | null = null;
    let availableVehicles: Metric | null = null;
    let vehiclesPurchased: Metric | null = null;
    let expectedRevenue: Metric | null = null;
    let totalInventoryValue: Metric | null = null;
    let inventoryAging: { label: string; value: number }[] = [];
    let aiInsights: AiInsightDto[] = [];
    if (vehiclesScope) {
      const { branchIds } = scopeFilter(ctx, vehiclesScope, { branchField: "branchId" });
      const rows = await db.$queryRaw<MetricRow[]>`
        SELECT * FROM dashboard_stock_kpis(
          ${bounds[0]}::timestamptz, ${bounds[1]}::timestamptz, ${bounds[2]}::timestamptz, ${bounds[3]}::timestamptz,
          ${branchIds}::text[], ${includeProfit}::boolean)`;
      totalVehicles = toMetric(rows, "total_vehicles");
      availableVehicles = toMetric(rows, "available_vehicles");
      vehiclesPurchased = toMetric(rows, "vehicles_purchased");
      expectedRevenue = toMetric(rows, "expected_revenue");
      totalInventoryValue = includeProfit ? toMetric(rows, "inventory_value") : null;
      [inventoryAging, aiInsights] = await Promise.all([
        computeInventoryAging(db, branchIds),
        computeAiInsights(db, branchIds),
      ]);
    }

    let vehiclesSold: Metric | null = null;
    let monthlySales: Metric | null = null;
    let grossProfit: Metric | null = null;
    if (salesScope) {
      const { branchIds, ownerId } = scopeFilter(ctx, salesScope, { ownerField: "salespersonId", branchField: "branchId" });
      const rows = await db.$queryRaw<MetricRow[]>`
        SELECT * FROM dashboard_sales_kpis(
          ${bounds[0]}::timestamptz, ${bounds[1]}::timestamptz, ${bounds[2]}::timestamptz, ${bounds[3]}::timestamptz,
          ${branchIds}::text[], ${ownerId}::text, ${includeProfit}::boolean)`;
      vehiclesSold = toMetric(rows, "vehicles_sold");
      monthlySales = toMetric(rows, "sales_revenue");
      grossProfit = includeProfit ? toMetric(rows, "gross_profit") : null;
    }

    let newLeads: Metric | null = null;
    let conversionRate: Metric | null = null;
    if (leadsScope) {
      const { branchIds, ownerId } = scopeFilter(ctx, leadsScope, { ownerField: "assignedToId", branchField: "branchId" });
      const rows = await db.$queryRaw<MetricRow[]>`
        SELECT * FROM dashboard_lead_kpis(
          ${bounds[0]}::timestamptz, ${bounds[1]}::timestamptz, ${bounds[2]}::timestamptz, ${bounds[3]}::timestamptz,
          ${branchIds}::text[], ${ownerId}::text)`;
      newLeads = toMetric(rows, "new_leads");
      conversionRate = toMetric(rows, "conversion_rate", "points");
    }

    return {
      period: r.period,
      currency: r.currency,
      totalVehicles,
      availableVehicles,
      vehiclesPurchased,
      expectedRevenue,
      totalInventoryValue,
      vehiclesSold,
      monthlySales,
      grossProfit,
      newLeads,
      conversionRate,
      inventoryAging,
      aiInsights,
    };
  });
}
