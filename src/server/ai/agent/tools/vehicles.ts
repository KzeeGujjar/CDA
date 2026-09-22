import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { notFound } from "@/server/lib/errors";
import { estimateFromComparables, MIN_COMPARABLES, type Comparable } from "@/lib/valuation/estimate";
import { emirateCodes, vehicleImportSpecs, vehicleSourceTypes } from "@/lib/uae/reference";
import { defineTool } from "../types";

const num = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? null : Number(d));
const statusValues = [
  "available",
  "reserved",
  "sold",
  "purchased",
  "in_transit",
  "under_inspection",
  "under_repair",
] as const;
const DAY = 86_400_000;
const daysSince = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY));

const summary = (v: {
  id: string;
  stockNumber: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  condition: string;
  mileageKm: number | null;
  status: string;
  emirate: string | null;
  importSpec: string | null;
  sourceType: string | null;
  listPrice: { toString(): string };
  expectedSellingPrice: { toString(): string } | null;
  acquiredAt: Date;
}) => ({
  id: v.id,
  stockNumber: v.stockNumber,
  label: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`,
  condition: v.condition.toLowerCase(),
  mileageKm: v.mileageKm,
  status: v.status.toLowerCase(),
  emirate: v.emirate ? v.emirate.toLowerCase() : null,
  importSpec: v.importSpec ? v.importSpec.toLowerCase() : null,
  sourceType: v.sourceType ? v.sourceType.toLowerCase() : null,
  listPrice: num(v.listPrice),
  expectedSellingPrice: num(v.expectedSellingPrice),
  daysInStock: daysSince(v.acquiredAt),
});

export const searchVehicles = defineTool({
  name: "searchVehicles",
  description:
    "Search the dealership's vehicles (up to 20 results). Filter by free text (make, model, trim, stock number, VIN), make, model, year range, list price range (in the dealership currency), status, UAE emirate (dubai, abu_dhabi, sharjah, ajman, ras_al_khaimah, fujairah, umm_al_quwain), specification (gcc, uae, imported) and source (auction, dealer, private, export, import). Returns a short summary of each match; use getVehicle for details. Archived vehicles are never returned.",
  schema: z.strictObject({
    query: z.string().trim().min(1).max(100).optional().describe("Free text: make, model, trim, stock number or VIN."),
    make: z.string().trim().min(1).max(60).optional(),
    model: z.string().trim().min(1).max(60).optional(),
    minYear: z.number().int().min(1990).max(2100).optional(),
    maxYear: z.number().int().min(1990).max(2100).optional(),
    minPrice: z.number().min(0).max(1_000_000_000).optional().describe("Minimum list price."),
    maxPrice: z.number().min(0).max(1_000_000_000).optional().describe("Maximum list price."),
    status: z.enum(statusValues).optional(),
    emirate: z.enum(emirateCodes).optional().describe("Emirate the vehicle is in."),
    importSpec: z.enum(vehicleImportSpecs).optional().describe("Specification: gcc, uae or imported."),
    sourceType: z.enum(vehicleSourceTypes).optional().describe("Where the vehicle came from."),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  requires: [["vehicles", "read"]],
  confirm: false,
  summarize: (r) => `Found ${(r as { count: number }).count} vehicle(s)`,
  async execute(ctx, db, a) {
    const scope = requirePermission(ctx, "vehicles", "read");
    const text = (field: "make" | "model" | "trim" | "stockNumber" | "vin", v: string): Prisma.VehicleWhereInput => ({
      [field]: { contains: v, mode: "insensitive" },
    });
    const where: Prisma.VehicleWhereInput = {
      AND: [
        scopeWhere(ctx, scope, { branchField: "branchId" }) as Prisma.VehicleWhereInput,
        { status: a.status ? (a.status.toUpperCase() as never) : { not: "ARCHIVED" } },
        ...(a.query
          ? [{ OR: (["make", "model", "trim", "stockNumber", "vin"] as const).map((f) => text(f, a.query!)) }]
          : []),
        ...(a.emirate ? [{ emirate: a.emirate.toUpperCase() as never }] : []),
        ...(a.importSpec ? [{ importSpec: a.importSpec.toUpperCase() as never }] : []),
        ...(a.sourceType ? [{ sourceType: a.sourceType.toUpperCase() as never }] : []),
        ...(a.make ? [text("make", a.make)] : []),
        ...(a.model ? [text("model", a.model)] : []),
        ...(a.minYear !== undefined || a.maxYear !== undefined ? [{ year: { gte: a.minYear, lte: a.maxYear } }] : []),
        ...(a.minPrice !== undefined || a.maxPrice !== undefined
          ? [{ listPrice: { gte: a.minPrice, lte: a.maxPrice } }]
          : []),
      ],
    };
    const rows = await db.vehicle.findMany({ where, orderBy: { acquiredAt: "desc" }, take: a.limit });
    return { count: rows.length, truncated: rows.length === a.limit, vehicles: rows.map(summary) };
  },
});

export const getVehicle = defineTool({
  name: "getVehicle",
  description:
    "Get one vehicle in detail by its id or its stock number. Cost and margin figures are included only when the current user is allowed to see them.",
  schema: z
    .strictObject({
      vehicleId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,64}$/)
        .optional(),
      stockNumber: z.string().trim().min(1).max(60).optional(),
    })
    .refine((v) => Number(!!v.vehicleId) + Number(!!v.stockNumber) === 1, {
      message: "Give exactly one of vehicleId or stockNumber.",
    }),
  requires: [["vehicles", "read"]],
  confirm: false,
  summarize: () => "Read one vehicle",
  async execute(ctx, db, a) {
    const scope = requirePermission(ctx, "vehicles", "read");
    const v = await db.vehicle.findFirst({ where: a.vehicleId ? { id: a.vehicleId } : { stockNumber: a.stockNumber } });
    // Another organization's vehicle, or one outside the caller's branches, is simply "not found".
    if (!v || !scopeAllows(ctx, scope, { branchField: "branchId" }, v)) throw notFound("Vehicle not found.");
    const out: Record<string, unknown> = {
      ...summary(v),
      vin: v.vin,
      estimatedMarketValue: num(v.estimatedMarketValue),
      branchId: v.branchId,
      acquiredAt: v.acquiredAt.toISOString().slice(0, 10),
    };
    if (can(ctx, "profit", "read")) {
      const total = v.purchasePrice.plus(v.repairCost).plus(v.transportCost).plus(v.otherCost);
      out.costs = {
        purchasePrice: num(v.purchasePrice),
        repairCost: num(v.repairCost),
        transportCost: num(v.transportCost),
        otherCost: num(v.otherCost),
        totalCost: num(total),
        // Bought in another currency: what was agreed and the rate applied (purchasePrice is already converted).
        ...(v.purchaseCurrency
          ? {
              purchasedIn: {
                currency: v.purchaseCurrency,
                amount: num(v.purchaseAmountOriginal),
                exchangeRate: num(v.purchaseFxRate),
              },
            }
          : {}),
      };
    }
    return out;
  },
});

export const getInventory = defineTool({
  name: "getInventory",
  description:
    "Summarise the current inventory: number of vehicles per status, stock on hand (not sold, not archived) with total list value and expected revenue, age of the stock in buckets, and the 5 oldest vehicles. Total cost of the stock is included only when the current user may see costs.",
  schema: z.strictObject({}),
  requires: [["vehicles", "read"]],
  confirm: false,
  summarize: (r) =>
    `Inventory summary: ${(r as { stockOnHand: { count: number } }).stockOnHand.count} vehicles in stock`,
  async execute(ctx, db) {
    const scope = requirePermission(ctx, "vehicles", "read");
    const mine = scopeWhere(ctx, scope, { branchField: "branchId" }) as Prisma.VehicleWhereInput;
    const stock: Prisma.VehicleWhereInput = { AND: [mine, { status: { notIn: ["SOLD", "ARCHIVED"] } }] };
    const [byStatus, sums, oldest] = await Promise.all([
      db.vehicle.groupBy({
        by: ["status"],
        where: { AND: [mine, { status: { not: "ARCHIVED" } }] },
        _count: { _all: true },
      }),
      db.vehicle.aggregate({
        where: stock,
        _count: { _all: true },
        _sum: {
          listPrice: true,
          purchasePrice: true,
          repairCost: true,
          transportCost: true,
          otherCost: true,
        },
      }),
      db.vehicle.findMany({ where: stock, orderBy: { acquiredAt: "asc" }, take: 5 }),
    ]);
    const org = await db.organization.findFirstOrThrow({ select: { currency: true } });
    // Expected revenue per vehicle is its expected selling price, else its list price (same rule as the dashboard).
    const [withExpected, withoutExpected] = await Promise.all([
      db.vehicle.aggregate({
        where: { AND: [stock, { expectedSellingPrice: { not: null } }] },
        _sum: { expectedSellingPrice: true },
      }),
      db.vehicle.aggregate({ where: { AND: [stock, { expectedSellingPrice: null }] }, _sum: { listPrice: true } }),
    ]);
    const now = Date.now();
    const bucket = (min: number, max: number | null): Prisma.VehicleWhereInput => ({
      AND: [
        stock,
        {
          acquiredAt: {
            ...(max === null ? {} : { gt: new Date(now - (max + 1) * DAY) }),
            lte: new Date(now - min * DAY),
          },
        },
      ],
    });
    const [b0, b1, b2, b3] = await Promise.all([
      db.vehicle.count({ where: bucket(0, 30) }),
      db.vehicle.count({ where: bucket(31, 60) }),
      db.vehicle.count({ where: bucket(61, 90) }),
      db.vehicle.count({ where: bucket(91, null) }),
    ]);
    const result: Record<string, unknown> = {
      currency: org.currency,
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status.toLowerCase(), g._count._all])),
      stockOnHand: {
        count: sums._count._all,
        totalListValue: num(sums._sum.listPrice) ?? 0,
        expectedRevenue:
          (num(withExpected._sum.expectedSellingPrice) ?? 0) + (num(withoutExpected._sum.listPrice) ?? 0),
      },
      aging: { "0-30 days": b0, "31-60 days": b1, "61-90 days": b2, "over 90 days": b3 },
      oldest: oldest.map(summary),
    };
    if (can(ctx, "profit", "read")) {
      const s = sums._sum;
      const totalCost = [s.purchasePrice, s.repairCost, s.transportCost, s.otherCost].reduce(
        (n, d) => n + (num(d) ?? 0),
        0
      );
      (result.stockOnHand as Record<string, unknown>).totalCost = Math.round(totalCost * 100) / 100;
    }
    return result;
  },
});

export const getValuation = defineTool({
  name: "getValuation",
  description:
    "Estimate the value of a vehicle (make, model, year, mileage) from the dealership's OWN comparable vehicles: current stock asking prices and, when the user may see sales, past sale prices. This is not market data. It returns null with an explanation when there are fewer than 3 comparables. Always tell the user how many comparables were used and how confident the estimate is.",
  schema: z.strictObject({
    make: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    year: z.number().int().min(1990).max(2100),
    mileageKm: z.number().int().min(0).max(2_000_000),
    condition: z.enum(["new", "used", "certified_pre_owned"]).optional(),
  }),
  requires: [
    ["valuations", "read"],
    ["vehicles", "read"],
  ],
  confirm: false,
  activity: "VALUATION",
  summarize: (r) => {
    const e = (r as { estimate: { estimatedValue: number } | null }).estimate;
    return e ? "Valuation estimated from own comparables" : "Valuation: not enough comparables";
  },
  async execute(ctx, db, a) {
    const vScope = requirePermission(ctx, "vehicles", "read");
    const same = {
      make: { equals: a.make, mode: "insensitive" as const },
      model: { equals: a.model, mode: "insensitive" as const },
    };
    const near = { year: { gte: a.year - 3, lte: a.year + 3 } };
    const mine = scopeWhere(ctx, vScope, { branchField: "branchId" }) as Prisma.VehicleWhereInput;
    const stockRows = await db.vehicle.findMany({
      where: { AND: [mine, same, near, { status: { notIn: ["SOLD", "ARCHIVED"] } }] },
      take: 60,
    });
    const comparables: Comparable[] = stockRows.map((v) => ({
      id: v.id,
      source: "stock",
      title: `${v.year} ${v.make} ${v.model}`,
      year: v.year,
      mileageKm: v.mileageKm,
      price: num(v.expectedSellingPrice ?? v.listPrice) ?? 0,
    }));
    if (can(ctx, "sales", "read")) {
      const sScope = requirePermission(ctx, "sales", "read");
      const deals = await db.deal.findMany({
        where: {
          AND: [
            scopeWhere(ctx, sScope, { ownerField: "salespersonId", branchField: "branchId" }) as Prisma.DealWhereInput,
            { status: "COMPLETED", vehicle: { is: { ...same, ...near } } },
          ],
        },
        include: { vehicle: true },
        orderBy: { completedAt: "desc" },
        take: 60,
      });
      for (const d of deals) {
        comparables.push({
          id: d.id,
          source: "sold",
          title: `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}`,
          year: d.vehicle.year,
          mileageKm: d.vehicle.mileageKm,
          price: num(d.salePrice) ?? 0,
        });
      }
    }
    const org = await db.organization.findFirstOrThrow({ select: { currency: true } });
    const estimate = estimateFromComparables(
      { make: a.make, model: a.model, year: a.year, mileageKm: a.mileageKm },
      comparables
    );
    return {
      currency: org.currency,
      estimate,
      comparablesFound: comparables.length,
      ...(estimate
        ? {}
        : {
            message: `Not enough comparable vehicles in the dealership's own data (need at least ${MIN_COMPARABLES}, found ${comparables.length}). No estimate was made.`,
          }),
      includesSoldPrices: can(ctx, "sales", "read"),
    };
  },
});
