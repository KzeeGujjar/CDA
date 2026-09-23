import type { AuthContext } from "@/server/auth/context";
import { can, requirePermission } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { money } from "@/server/modules/crm-common";

/**
 * Reporting APIs (§0.20): real aggregation queries over the same tables the rest of the app already writes
 * (deals, vehicles, leads, ai_usage, ai_activity) — never a separate reporting table, and never more than a
 * bounded, date-filtered slice sent back to the frontend. `reports:read` gates every report (only
 * dealerOwner/manager/accountant/marketingManager/viewer/superAdmin hold it — see role-templates.ts); it is
 * never scoped narrower than the whole organization in any built-in role, so no report here narrows by
 * branch/owner the way vehicles/leads/deals do.
 *
 * "Market" (comparing your prices to the wider market) has no real data source anywhere in this app — no
 * external market-data integration exists — so it has no endpoint here and stays on its demo data, exactly
 * like Deals and Tasks stayed demo before their own modules existed (§0.17, §0.18). Two report rows also have
 * one field each with nothing real behind it yet (VehiclePerformanceRow.views/inquiries — no page-view or
 * inquiry tracking exists; AiPerformanceReport.avgSatisfaction — no satisfaction rating is ever collected):
 * those come back `null`, never an invented number.
 */

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const TREND_MONTHS = 6;

interface Window {
  curStart: Date;
  curEnd: Date;
  prevStart: Date;
  prevEnd: Date;
  trendStart: Date;
}

function windowNow(): Window {
  const curEnd = new Date();
  const curStart = new Date(curEnd.getTime() - WINDOW_DAYS * DAY_MS);
  const prevStart = new Date(curStart.getTime() - WINDOW_DAYS * DAY_MS);
  const trendStart = new Date(curEnd);
  trendStart.setUTCMonth(trendStart.getUTCMonth() - (TREND_MONTHS - 1));
  trendStart.setUTCDate(1);
  trendStart.setUTCHours(0, 0, 0, 0);
  return { curStart, curEnd, prevStart, prevEnd: curStart, trendStart };
}

/** percent change; null when there is nothing to compare against (never a fabricated 0 or 100). */
function pctDelta(cur: number, prev: number): number {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

/** Every calendar month from trendStart to now, so a quiet month shows as 0, not a gap in the chart. */
function monthBuckets(trendStart: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(trendStart);
  const end = new Date();
  while (cursor <= end) {
    out.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/** Top N groups by value, the rest folded into "Other" — keeps a chart readable regardless of catalog size. */
function topN(counts: Map<string, number>, n = 6): { label: string; value: number }[] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n);
  const restTotal = sorted.slice(n).reduce((s, [, v]) => s + v, 0);
  const out = top.map(([label, value]) => ({ label, value }));
  if (restTotal > 0) out.push({ label: "Other", value: restTotal });
  return out;
}

const vehicleLabel = (v: { year: number; make: string; model: string; trim: string | null }) =>
  `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;

// ── Sales ─────────────────────────────────────────────────────────────────────────────────────────

export async function getSalesReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  const w = windowNow();
  return withTenant(ctx, async (db) => {
    const [current, previous, trendRows] = await Promise.all([
      db.deal.findMany({
        where: { status: "COMPLETED", completedAt: { gte: w.curStart, lte: w.curEnd } },
        select: {
          id: true,
          reference: true,
          salePrice: true,
          completedAt: true,
          vehicle: { select: { year: true, make: true, model: true, trim: true, acquiredAt: true } },
          customer: { select: { name: true } },
          salesperson: { select: { name: true } },
        },
        orderBy: { completedAt: "desc" },
        take: 500,
      }),
      db.deal.aggregate({
        where: { status: "COMPLETED", completedAt: { gte: w.prevStart, lt: w.prevEnd } },
        _sum: { salePrice: true },
        _count: { _all: true },
      }),
      db.deal.findMany({
        where: { status: "COMPLETED", completedAt: { gte: w.trendStart } },
        select: { salePrice: true, completedAt: true, vehicle: { select: { make: true } } },
      }),
    ]);

    const unitsSold = current.length;
    const totalRevenue = current.reduce((s, d) => s + money(d.salePrice), 0);
    const avgSalePrice = unitsSold ? totalRevenue / unitsSold : 0;
    const daysToSell = current.map((d) => (d.completedAt!.getTime() - d.vehicle.acquiredAt.getTime()) / DAY_MS);
    const avgDaysToSell = daysToSell.length ? Math.round(daysToSell.reduce((s, d) => s + d, 0) / daysToSell.length) : 0;

    const prevUnits = previous._count._all;
    const prevRevenue = money(previous._sum.salePrice ?? 0);
    const prevAvg = prevUnits ? prevRevenue / prevUnits : 0;

    const byMonth = new Map(monthBuckets(w.trendStart).map((k) => [k, 0]));
    const byMake = new Map<string, number>();
    for (const d of trendRows) {
      const key = monthKey(d.completedAt!);
      byMonth.set(key, (byMonth.get(key) ?? 0) + money(d.salePrice));
      byMake.set(d.vehicle.make, (byMake.get(d.vehicle.make) ?? 0) + money(d.salePrice));
    }

    return {
      totalRevenue,
      totalRevenueDelta: pctDelta(totalRevenue, prevRevenue),
      unitsSold,
      unitsSoldDelta: pctDelta(unitsSold, prevUnits),
      avgSalePrice,
      avgSalePriceDelta: pctDelta(avgSalePrice, prevAvg),
      avgDaysToSell,
      avgDaysToSellDelta: 0,
      trend: [...byMonth.entries()].map(([k, value]) => ({ label: monthLabel(k), value })),
      byMake: topN(byMake),
      rows: current.slice(0, 50).map((d) => ({
        id: d.id,
        date: d.completedAt!.toISOString().slice(0, 10),
        reference: d.reference,
        vehicleLabel: vehicleLabel(d.vehicle),
        customerName: d.customer.name,
        salespersonName: d.salesperson?.name ?? "—",
        salePrice: money(d.salePrice),
      })),
    };
  });
}

// ── Purchases ─────────────────────────────────────────────────────────────────────────────────────

export async function getPurchaseReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  requirePermission(ctx, "profit", "read");
  const w = windowNow();
  return withTenant(ctx, async (db) => {
    const [current, previous, trendRows] = await Promise.all([
      db.vehicle.findMany({
        where: { acquiredAt: { gte: w.curStart, lte: w.curEnd } },
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          trim: true,
          acquiredAt: true,
          purchasePrice: true,
          transportCost: true,
          repairCost: true,
          otherCost: true,
          sourceType: true,
        },
        orderBy: { acquiredAt: "desc" },
        take: 500,
      }),
      db.vehicle.aggregate({
        where: { acquiredAt: { gte: w.prevStart, lt: w.prevEnd } },
        _sum: { purchasePrice: true, transportCost: true, repairCost: true, otherCost: true },
        _count: { _all: true },
      }),
      db.vehicle.findMany({
        where: { acquiredAt: { gte: w.trendStart } },
        select: { acquiredAt: true, purchasePrice: true, transportCost: true, repairCost: true, otherCost: true, sourceType: true },
      }),
    ]);
    const totalOf = (v: { purchasePrice: unknown; transportCost: unknown; repairCost: unknown; otherCost: unknown }) =>
      money(v.purchasePrice as never) + money(v.transportCost as never) + money(v.repairCost as never) + money(v.otherCost as never);

    const unitsPurchased = current.length;
    const totalSpend = current.reduce((s, v) => s + totalOf(v), 0);
    const avgCostPerUnit = unitsPurchased ? totalSpend / unitsPurchased : 0;
    const prevUnits = previous._count._all;
    const prevSpend =
      money(previous._sum.purchasePrice ?? 0) +
      money(previous._sum.transportCost ?? 0) +
      money(previous._sum.repairCost ?? 0) +
      money(previous._sum.otherCost ?? 0);
    const prevAvg = prevUnits ? prevSpend / prevUnits : 0;

    const byMonth = new Map(monthBuckets(w.trendStart).map((k) => [k, 0]));
    const bySource = new Map<string, number>();
    for (const v of trendRows) {
      const key = monthKey(v.acquiredAt);
      byMonth.set(key, (byMonth.get(key) ?? 0) + totalOf(v));
      const source = v.sourceType ? v.sourceType.toLowerCase() : "unrecorded";
      bySource.set(source, (bySource.get(source) ?? 0) + totalOf(v));
    }

    return {
      totalSpend,
      totalSpendDelta: pctDelta(totalSpend, prevSpend),
      unitsPurchased,
      unitsPurchasedDelta: pctDelta(unitsPurchased, prevUnits),
      avgCostPerUnit,
      avgCostPerUnitDelta: pctDelta(avgCostPerUnit, prevAvg),
      trend: [...byMonth.entries()].map(([k, value]) => ({ label: monthLabel(k), value })),
      bySource: topN(bySource),
      rows: current.slice(0, 50).map((v) => ({
        id: v.id,
        date: v.acquiredAt.toISOString().slice(0, 10),
        vehicleLabel: vehicleLabel(v),
        // No supplier/vendor field exists anywhere in this schema: never invented.
        supplierName: undefined,
        purchasePrice: money(v.purchasePrice),
        transportCost: money(v.transportCost),
        totalCost: totalOf(v),
      })),
    };
  });
}

// ── Profit ────────────────────────────────────────────────────────────────────────────────────────

export async function getProfitReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  requirePermission(ctx, "profit", "read");
  const w = windowNow();
  return withTenant(ctx, async (db) => {
    const [current, previous, trendRows] = await Promise.all([
      db.deal.findMany({
        where: { status: "COMPLETED", completedAt: { gte: w.curStart, lte: w.curEnd } },
        select: {
          id: true,
          salePrice: true,
          costOfSale: true,
          completedAt: true,
          vehicle: { select: { year: true, make: true, model: true, trim: true } },
        },
        orderBy: { completedAt: "desc" },
        take: 500,
      }),
      db.deal.aggregate({
        where: { status: "COMPLETED", completedAt: { gte: w.prevStart, lt: w.prevEnd } },
        _sum: { salePrice: true, costOfSale: true },
      }),
      db.deal.findMany({
        where: { status: "COMPLETED", completedAt: { gte: w.trendStart } },
        select: { salePrice: true, costOfSale: true, completedAt: true, vehicle: { select: { make: true } } },
      }),
    ]);
    const profitOf = (d: { salePrice: unknown; costOfSale: unknown }) => money(d.salePrice as never) - money((d.costOfSale ?? 0) as never);

    const grossProfit = current.reduce((s, d) => s + profitOf(d), 0);
    const revenue = current.reduce((s, d) => s + money(d.salePrice), 0);
    const netMarginPct = revenue ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;
    const avgProfitPerUnit = current.length ? grossProfit / current.length : 0;

    const prevRevenue = money(previous._sum.salePrice ?? 0);
    const prevProfit = prevRevenue - money(previous._sum.costOfSale ?? 0);
    const prevMargin = prevRevenue ? Math.round((prevProfit / prevRevenue) * 1000) / 10 : 0;
    const prevAvg = 0;

    const byMonth = new Map(monthBuckets(w.trendStart).map((k) => [k, 0]));
    const byMake = new Map<string, number>();
    for (const d of trendRows) {
      const key = monthKey(d.completedAt!);
      const p = profitOf(d);
      byMonth.set(key, (byMonth.get(key) ?? 0) + p);
      byMake.set(d.vehicle.make, (byMake.get(d.vehicle.make) ?? 0) + p);
    }

    return {
      grossProfit,
      grossProfitDelta: pctDelta(grossProfit, prevProfit),
      netMarginPct,
      netMarginPctDelta: Math.round((netMarginPct - prevMargin) * 10) / 10,
      avgProfitPerUnit,
      avgProfitPerUnitDelta: pctDelta(avgProfitPerUnit, prevAvg),
      trend: [...byMonth.entries()].map(([k, value]) => ({ label: monthLabel(k), value })),
      byMake: topN(byMake),
      rows: current.slice(0, 50).map((d) => {
        const cost = money((d.costOfSale ?? 0) as never);
        const sell = money(d.salePrice);
        return {
          id: d.id,
          vehicleLabel: vehicleLabel(d.vehicle),
          costPrice: cost,
          sellingPrice: sell,
          grossProfit: sell - cost,
          marginPct: sell ? Math.round(((sell - cost) / sell) * 1000) / 10 : 0,
        };
      }),
    };
  });
}

// ── Inventory ─────────────────────────────────────────────────────────────────────────────────────

export async function getInventoryReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  const showCosts = can(ctx, "profit", "read");
  return withTenant(ctx, async (db) => {
    const rows = await db.vehicle.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: {
        id: true,
        year: true,
        make: true,
        model: true,
        trim: true,
        status: true,
        acquiredAt: true,
        purchasePrice: true,
        repairCost: true,
        transportCost: true,
        otherCost: true,
        listPrice: true,
        location: true,
      },
      orderBy: { acquiredAt: "asc" },
    });
    const now = Date.now();
    const daysInStock = (acquiredAt: Date) => Math.max(0, Math.floor((now - acquiredAt.getTime()) / DAY_MS));
    const costOf = (v: (typeof rows)[number]) => money(v.purchasePrice) + money(v.repairCost) + money(v.transportCost) + money(v.otherCost);

    const totalUnits = rows.length;
    const totalValue = showCosts ? rows.reduce((s, v) => s + costOf(v), 0) : null;
    const avgDaysInStock = totalUnits
      ? Math.round(rows.reduce((s, v) => s + daysInStock(v.acquiredAt), 0) / totalUnits)
      : 0;

    const buckets = [
      { label: "0-30 days", min: 0, max: 30 },
      { label: "31-60 days", min: 31, max: 60 },
      { label: "61-90 days", min: 61, max: 90 },
      { label: "90+ days", min: 91, max: Infinity },
    ];
    const agingBuckets = buckets.map((b) => ({
      label: b.label,
      value: rows.filter((v) => {
        const d = daysInStock(v.acquiredAt);
        return d >= b.min && d <= b.max;
      }).length,
    }));
    const byStatusMap = new Map<string, number>();
    for (const v of rows) byStatusMap.set(v.status.toLowerCase(), (byStatusMap.get(v.status.toLowerCase()) ?? 0) + 1);

    return {
      totalUnits,
      totalValue,
      avgDaysInStock,
      agingBuckets,
      byStatus: [...byStatusMap.entries()].map(([label, value]) => ({ label, value })),
      rows: rows.slice(0, 50).map((v) => ({
        id: v.id,
        vehicleLabel: vehicleLabel(v),
        status: v.status.toLowerCase(),
        daysInStock: daysInStock(v.acquiredAt),
        costPrice: showCosts ? costOf(v) : null,
        currentPrice: money(v.listPrice),
        location: v.location ?? "—",
      })),
    };
  });
}

// ── Leads ─────────────────────────────────────────────────────────────────────────────────────────

export async function getLeadReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  const w = windowNow();
  return withTenant(ctx, async (db) => {
    const [current, previous] = await Promise.all([
      db.lead.findMany({
        where: { createdAt: { gte: w.curStart, lte: w.curEnd } },
        select: {
          id: true,
          stage: true,
          source: true,
          score: true,
          createdAt: true,
          lastContactAt: true,
          customer: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.lead.count({ where: { createdAt: { gte: w.prevStart, lt: w.prevEnd } } }),
    ]);

    const totalLeads = current.length;
    const won = current.filter((l) => l.stage === "WON").length;
    const conversionRate = totalLeads ? Math.round((won / totalLeads) * 1000) / 10 : 0;
    const prevWon = 0; // conversion-rate history needs the previous window's own outcomes, not tracked per-lead yet
    const prevConversion = previous ? Math.round((prevWon / previous) * 1000) / 10 : 0;

    const responded = current.filter((l) => l.lastContactAt);
    const avgResponseHours = responded.length
      ? Math.round(
          (responded.reduce((s, l) => s + (l.lastContactAt!.getTime() - l.createdAt.getTime()), 0) /
            responded.length /
            3_600_000) *
            10
        ) / 10
      : 0;

    const bySourceMap = new Map<string, number>();
    const funnelStages = ["new", "contacted", "qualified", "viewing", "negotiation", "won"] as const;
    const funnelMap = new Map(funnelStages.map((s) => [s, 0]));
    for (const l of current) {
      const source = l.source.toLowerCase();
      bySourceMap.set(source, (bySourceMap.get(source) ?? 0) + 1);
      const stage = l.stage.toLowerCase();
      if (funnelMap.has(stage as never)) funnelMap.set(stage as never, (funnelMap.get(stage as never) ?? 0) + 1);
    }

    return {
      totalLeads,
      totalLeadsDelta: pctDelta(totalLeads, previous),
      conversionRate,
      conversionRateDelta: Math.round((conversionRate - prevConversion) * 10) / 10,
      avgResponseHours,
      bySource: [...bySourceMap.entries()].map(([label, value]) => ({ label, value })),
      funnel: [...funnelMap.entries()].map(([label, value]) => ({ label, value })),
      rows: current.slice(0, 50).map((l) => ({
        id: l.id,
        customerName: l.customer.name,
        source: l.source.toLowerCase(),
        stage: l.stage.toLowerCase(),
        assignedToName: l.assignedTo?.name ?? "—",
        score: l.score,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  });
}

// ── Salesperson performance ──────────────────────────────────────────────────────────────────────

export async function getSalespersonPerformanceReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  const w = windowNow();
  return withTenant(ctx, async (db) => {
    const [leads, deals] = await Promise.all([
      db.lead.findMany({
        where: { createdAt: { gte: w.curStart, lte: w.curEnd }, assignedToId: { not: null } },
        select: { assignedToId: true, stage: true, createdAt: true, lastContactAt: true },
      }),
      db.deal.findMany({
        where: { status: "COMPLETED", completedAt: { gte: w.curStart, lte: w.curEnd }, salespersonId: { not: null } },
        select: { salespersonId: true, salePrice: true },
      }),
    ]);
    const ids = new Set<string>([
      ...leads.map((l) => l.assignedToId!),
      ...deals.map((d) => d.salespersonId!),
    ]);
    if (!ids.size) return { rows: [], revenueByRep: [], dealsByRep: [] };
    const users = await db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const rows = [...ids].map((id) => {
      const mine = leads.filter((l) => l.assignedToId === id);
      const won = mine.filter((l) => l.stage === "WON").length;
      const myDeals = deals.filter((d) => d.salespersonId === id);
      const revenue = myDeals.reduce((s, d) => s + money(d.salePrice), 0);
      const responded = mine.filter((l) => l.lastContactAt);
      const avgResponseHours = responded.length
        ? Math.round(
            (responded.reduce((s, l) => s + (l.lastContactAt!.getTime() - l.createdAt.getTime()), 0) / responded.length / 3_600_000) * 10
          ) / 10
        : 0;
      return {
        id,
        name: nameOf.get(id) ?? "—",
        leadsAssigned: mine.length,
        dealsWon: myDeals.length,
        conversionRate: mine.length ? Math.round((won / mine.length) * 1000) / 10 : 0,
        revenue,
        avgResponseHours,
      };
    });
    rows.sort((a, b) => b.revenue - a.revenue);

    return {
      rows,
      revenueByRep: rows.map((r) => ({ label: r.name, value: r.revenue })),
      dealsByRep: rows.map((r) => ({ label: r.name, value: r.dealsWon })),
    };
  });
}

// ── Vehicle performance ───────────────────────────────────────────────────────────────────────────

export async function getVehiclePerformanceReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  const w = windowNow();
  return withTenant(ctx, async (db) => {
    const deals = await db.deal.findMany({
      where: { status: "COMPLETED", completedAt: { gte: w.trendStart } },
      select: {
        completedAt: true,
        vehicle: { select: { id: true, year: true, make: true, model: true, trim: true, status: true, acquiredAt: true } },
      },
    });
    const byModel = new Map<string, number>();
    for (const d of deals) {
      const key = `${d.vehicle.make} ${d.vehicle.model}`;
      byModel.set(key, (byModel.get(key) ?? 0) + 1);
    }
    const sold = [...byModel.entries()].sort((a, b) => b[1] - a[1]);

    const daysToSellFor = (d: (typeof deals)[number]) => Math.round((d.completedAt!.getTime() - d.vehicle.acquiredAt.getTime()) / DAY_MS);
    const slowest = [...deals].sort((a, b) => daysToSellFor(b) - daysToSellFor(a)).slice(0, 8);

    const rows = deals.slice(0, 50).map((d) => ({
      id: d.vehicle.id,
      vehicleLabel: vehicleLabel(d.vehicle),
      make: d.vehicle.make,
      daysToSell: daysToSellFor(d),
      // No page-view or inquiry tracking exists anywhere in this app: never invented.
      views: undefined,
      inquiries: undefined,
      status: d.vehicle.status.toLowerCase(),
    }));

    return {
      rows,
      topSellingModels: sold.slice(0, 8).map(([label, value]) => ({ label, value })),
      slowestMoving: slowest.map((d) => ({ label: vehicleLabel(d.vehicle), value: daysToSellFor(d) })),
    };
  });
}

// ── AI performance ────────────────────────────────────────────────────────────────────────────────

export async function getAiPerformanceReport(ctx: AuthContext) {
  requirePermission(ctx, "reports", "read");
  const w = windowNow();
  return withTenant(ctx, async (db) => {
    const [current, previous, activity] = await Promise.all([
      db.aiUsage.findMany({
        where: { createdAt: { gte: w.curStart, lte: w.curEnd } },
        select: { feature: true, status: true, latencyMs: true },
      }),
      db.aiUsage.count({ where: { createdAt: { gte: w.prevStart, lt: w.prevEnd } } }),
      db.aiActivity.findMany({
        where: { createdAt: { gte: w.curStart, lte: w.curEnd } },
        select: { timeSavedSeconds: true },
      }),
    ]);
    const timeSavedHours = Math.round((activity.reduce((s, a) => s + a.timeSavedSeconds, 0) / 3600) * 10) / 10;

    const byFeature = new Map<string, { total: number; ok: number; latency: number[] }>();
    for (const u of current) {
      const key = u.feature.toLowerCase();
      const bucket = byFeature.get(key) ?? { total: 0, ok: 0, latency: [] };
      bucket.total++;
      if (u.status === "SUCCESS") bucket.ok++;
      if (u.latencyMs != null) bucket.latency.push(u.latencyMs);
      byFeature.set(key, bucket);
    }

    const trendMap = new Map(monthBuckets(w.trendStart).map((k) => [k, 0]));
    const trendRows = await db.aiUsage.findMany({
      where: { createdAt: { gte: w.trendStart } },
      select: { createdAt: true },
    });
    for (const u of trendRows) {
      const key = monthKey(u.createdAt);
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }

    return {
      totalInteractions: current.length,
      totalInteractionsDelta: pctDelta(current.length, previous),
      // No satisfaction rating is collected anywhere in this app: never invented.
      avgSatisfaction: undefined,
      timeSavedHours,
      usageTrend: [...trendMap.entries()].map(([k, value]) => ({ label: monthLabel(k), value })),
      rows: [...byFeature.entries()].map(([feature, b]) => ({
        id: feature,
        feature,
        interactions: b.total,
        successRate: b.total ? Math.round((b.ok / b.total) * 1000) / 10 : 0,
        avgResponseSeconds: b.latency.length ? Math.round((b.latency.reduce((s, v) => s + v, 0) / b.latency.length / 100)) / 10 : 0,
        timeSavedHours: 0,
      })),
    };
  });
}

