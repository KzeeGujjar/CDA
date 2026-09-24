import { z } from "zod";
import type { Prisma, Vehicle } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { can, requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { conflict, forbidden, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { describeDatabaseError } from "@/server/lib/db-errors";
import { recordAudit } from "@/server/modules/audit/record";
import { notifyUser } from "@/server/modules/notifications/notifications.service";
import { emirateCodes, vehicleImportSpecs, vehicleSourceTypes } from "@/lib/uae/reference";
import { dayInZone, id, likeSafe, money, page, parseQuery, toEnum } from "@/server/modules/crm-common";
import { primaryPhotosByVehicle } from "@/server/modules/files/files.service";

/**
 * Vehicles (the inventory). The organization always comes from the session; the caller's role decides which
 * vehicles they see (branch scope) and whether they see or may change what the dealership PAID (profit:read).
 * A cost figure a caller may not see is `null` in the response, never 0.
 */
const CONDITIONS = ["new", "used", "certified_pre_owned"] as const;
const STATUSES = [
  "available",
  "reserved",
  "sold",
  "purchased",
  "in_transit",
  "under_inspection",
  "under_repair",
  "archived",
] as const;
const SORTS = ["price", "year", "daysInStock", "acquiredAt"] as const;

/** Money the database can hold (NUMERIC(14,2)), rounded to 2 decimals. */
const amount = z
  .number()
  .min(0)
  .max(100_000_000_000)
  .transform((n) => Math.round(n * 100) / 100);

const specSchema = z.strictObject({
  engine: z.string().trim().max(80).optional(),
  horsepower: z.number().int().min(0).max(3000).optional(),
  fuelType: z.enum(["petrol", "diesel", "hybrid", "electric"]).optional(),
  transmission: z.enum(["automatic", "manual"]).optional(),
  exteriorColor: z.string().trim().max(60).optional(),
  interiorColor: z.string().trim().max(60).optional(),
  seats: z.number().int().min(0).max(60).optional(),
  bodyType: z.string().trim().max(40).optional(),
  accidentHistory: z.enum(["none", "minor", "major"]).optional(),
  serviceHistory: z.enum(["full", "partial", "none"]).optional(),
  owners: z.number().int().min(0).max(50).optional(),
});
const registrationSchema = z.strictObject({
  status: z.enum(["registered", "not_registered", "pending_transfer"]).optional(),
  plateNumber: z.string().trim().max(40).optional(),
  expiryDate: z.iso.date().optional(),
  rtaNotes: z.string().trim().max(500).optional(),
});

const vehicleFields = {
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  trim: z.string().trim().max(80).optional(),
  year: z.number().int().min(1900).max(2100),
  condition: z.enum(CONDITIONS),
  status: z.enum(STATUSES),
  vin: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .regex(/^[A-Za-z0-9-]+$/, "may contain only letters, digits and dashes")
    .transform((v) => v.toUpperCase()),
  stockNumber: z.string().trim().min(1).max(40),
  mileageKm: z.number().int().min(0).max(3_000_000),
  listPrice: amount,
  expectedSellingPrice: amount,
  estimatedMarketValue: amount,
  purchasePrice: amount,
  repairCost: amount,
  transportCost: amount,
  otherCost: amount,
  emirate: z.enum(emirateCodes),
  importSpec: z.enum(vehicleImportSpecs),
  sourceType: z.enum(vehicleSourceTypes),
  branchId: id,
  location: z.string().trim().max(120),
  spec: specSchema,
  registration: registrationSchema,
  notes: z.string().trim().max(4000),
  featured: z.boolean(),
};
const COST_FIELDS = ["purchasePrice", "repairCost", "transportCost", "otherCost"] as const;

/** Note what is NOT here: no organizationId, no acquiredAt. Strict, so any extra key is a 400. */
export const createVehicleSchema = z.strictObject({
  make: vehicleFields.make,
  model: vehicleFields.model,
  year: vehicleFields.year,
  condition: vehicleFields.condition,
  listPrice: vehicleFields.listPrice,
  status: vehicleFields.status.default("available"),
  trim: vehicleFields.trim,
  vin: vehicleFields.vin.optional(),
  /** Generated (STK-<year><number>) when omitted. */
  stockNumber: vehicleFields.stockNumber.optional(),
  mileageKm: vehicleFields.mileageKm.optional(),
  expectedSellingPrice: vehicleFields.expectedSellingPrice.optional(),
  estimatedMarketValue: vehicleFields.estimatedMarketValue.optional(),
  /** What the dealership paid. Needs profit:read. */
  purchasePrice: vehicleFields.purchasePrice.optional(),
  repairCost: vehicleFields.repairCost.optional(),
  transportCost: vehicleFields.transportCost.optional(),
  otherCost: vehicleFields.otherCost.optional(),
  emirate: vehicleFields.emirate.optional(),
  importSpec: vehicleFields.importSpec.optional(),
  sourceType: vehicleFields.sourceType.optional(),
  branchId: vehicleFields.branchId.optional(),
  location: vehicleFields.location.optional(),
  spec: vehicleFields.spec.optional(),
  registration: vehicleFields.registration.optional(),
  notes: vehicleFields.notes.optional(),
  featured: vehicleFields.featured.optional(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

/** Every field optional; a value replaces the stored one. `null` clears an optional field. */
export const updateVehicleSchema = z
  .strictObject({
    make: vehicleFields.make,
    model: vehicleFields.model,
    year: vehicleFields.year,
    condition: vehicleFields.condition,
    status: vehicleFields.status,
    listPrice: vehicleFields.listPrice,
    trim: vehicleFields.trim.nullable(),
    vin: vehicleFields.vin.nullable(),
    stockNumber: vehicleFields.stockNumber,
    mileageKm: vehicleFields.mileageKm.nullable(),
    expectedSellingPrice: vehicleFields.expectedSellingPrice.nullable(),
    estimatedMarketValue: vehicleFields.estimatedMarketValue.nullable(),
    purchasePrice: vehicleFields.purchasePrice,
    repairCost: vehicleFields.repairCost,
    transportCost: vehicleFields.transportCost,
    otherCost: vehicleFields.otherCost,
    emirate: vehicleFields.emirate.nullable(),
    importSpec: vehicleFields.importSpec.nullable(),
    sourceType: vehicleFields.sourceType.nullable(),
    branchId: vehicleFields.branchId.nullable(),
    location: vehicleFields.location.nullable(),
    spec: vehicleFields.spec,
    registration: vehicleFields.registration,
    notes: vehicleFields.notes.nullable(),
    featured: vehicleFields.featured,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const listVehiclesQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  make: z.string().trim().max(60).optional(),
  status: z.enum(STATUSES).optional(),
  condition: z.enum(CONDITIONS).optional(),
  emirate: z.enum(emirateCodes).optional(),
  sourceType: z.enum(vehicleSourceTypes).optional(),
  minPrice: z.coerce.number().min(0).max(100_000_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(100_000_000_000).optional(),
  sortBy: z.enum(SORTS).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export interface VehicleDto {
  id: string;
  stockNumber: string;
  vin: string | null;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  condition: string;
  status: string;
  mileageKm: number | null;
  currency: string;
  listPrice: number;
  expectedSellingPrice: number | null;
  estimatedMarketValue: number | null;
  /** What the dealership paid. null unless the caller holds profit:read. */
  costs: {
    purchasePrice: number;
    repairCost: number;
    transportCost: number;
    otherCost: number;
    /** Set when the purchase was agreed in another currency (an import bought in USD). */
    purchaseOriginal: { currency: string; amount: number; fxRate: number } | null;
  } | null;
  emirate: string | null;
  importSpec: string | null;
  sourceType: string | null;
  branch: { id: string; name: string; emirate: string | null } | null;
  location: string | null;
  acquiredAt: string;
  daysInStock: number;
  spec: Record<string, unknown>;
  registration: Record<string, unknown>;
  notes: string | null;
  featured: boolean;
  /** Signed URL for the primary photo (or the first, if none is marked primary), null with no photos yet or if
   *  Storage could not be reached. Expires; re-fetch the vehicle rather than caching it. See §0.19. */
  primaryPhotoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type VehicleWithBranch = Vehicle & { branch: { id: string; name: string; emirate: string | null } | null };
const withBranch = { branch: { select: { id: true, name: true, emirate: true } } } as const;

function toDto(
  v: VehicleWithBranch,
  org: { currency: string; timezone: string },
  showCosts: boolean,
  primaryPhotoUrl: string | null = null
): VehicleDto {
  const n = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));
  return {
    id: v.id,
    stockNumber: v.stockNumber,
    vin: v.vin,
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: v.year,
    condition: v.condition.toLowerCase(),
    status: v.status.toLowerCase(),
    mileageKm: v.mileageKm,
    currency: org.currency,
    listPrice: money(v.listPrice),
    expectedSellingPrice: n(v.expectedSellingPrice),
    estimatedMarketValue: n(v.estimatedMarketValue),
    costs: showCosts
      ? {
          purchasePrice: money(v.purchasePrice),
          repairCost: money(v.repairCost),
          transportCost: money(v.transportCost),
          otherCost: money(v.otherCost),
          purchaseOriginal:
            v.purchaseCurrency && v.purchaseAmountOriginal && v.purchaseFxRate
              ? {
                  currency: v.purchaseCurrency,
                  amount: money(v.purchaseAmountOriginal),
                  fxRate: Number(v.purchaseFxRate.toString()),
                }
              : null,
        }
      : null,
    emirate: v.emirate ? toEnum(v.emirate) : null,
    importSpec: v.importSpec ? toEnum(v.importSpec) : null,
    sourceType: v.sourceType ? toEnum(v.sourceType) : null,
    branch: v.branch ? { ...v.branch, emirate: v.branch.emirate ? toEnum(v.branch.emirate) : null } : null,
    location: v.location,
    acquiredAt: v.acquiredAt.toISOString(),
    daysInStock: Math.max(0, dayInZone(new Date(), org.timezone) - dayInZone(v.acquiredAt, org.timezone)),
    spec: (v.spec ?? {}) as Record<string, unknown>,
    registration: (v.registration ?? {}) as Record<string, unknown>,
    notes: v.notes,
    featured: v.featured,
    primaryPhotoUrl,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

const orgFacts = (db: TenantDb) => db.organization.findFirstOrThrow({ select: { currency: true, timezone: true } });
const VEHICLE_SCOPE = { branchField: "branchId" } as const;

export async function listVehicles(ctx: AuthContext, query: URLSearchParams) {
  const scope = requirePermission(ctx, "vehicles", "read");
  const q = parseQuery(listVehiclesQuerySchema, query);
  const showCosts = can(ctx, "profit", "read");
  const s = q.search ? likeSafe(q.search) : undefined;
  const where: Prisma.VehicleWhereInput = {
    AND: [
      scopeWhere(ctx, scope, VEHICLE_SCOPE),
      ...(s
        ? [
            {
              OR: [
                { make: { contains: s, mode: "insensitive" as const } },
                { model: { contains: s, mode: "insensitive" as const } },
                { trim: { contains: s, mode: "insensitive" as const } },
                { vin: { contains: s, mode: "insensitive" as const } },
                { stockNumber: { contains: s, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...(q.make ? [{ make: q.make }] : []),
      ...(q.status ? [{ status: q.status.toUpperCase() as never }] : []),
      ...(q.condition ? [{ condition: q.condition.toUpperCase() as never }] : []),
      ...(q.emirate ? [{ emirate: q.emirate.toUpperCase() as never }] : []),
      ...(q.sourceType ? [{ sourceType: q.sourceType.toUpperCase() as never }] : []),
      ...(q.minPrice !== undefined ? [{ listPrice: { gte: q.minPrice } }] : []),
      ...(q.maxPrice !== undefined ? [{ listPrice: { lte: q.maxPrice } }] : []),
    ],
  };
  // "daysInStock" is the age of the vehicle, so most days in stock = oldest acquisition = ascending acquiredAt.
  const dir = q.sortDirection;
  const flip = dir === "asc" ? "desc" : "asc";
  const orderBy: Prisma.VehicleOrderByWithRelationInput[] = [
    q.sortBy === "price"
      ? { listPrice: dir }
      : q.sortBy === "year"
        ? { year: dir }
        : q.sortBy === "daysInStock"
          ? { acquiredAt: flip }
          : { acquiredAt: dir },
    { id: "asc" },
  ];
  return withTenant(ctx, async (db) => {
    const [org, total, rows] = await Promise.all([
      orgFacts(db),
      db.vehicle.count({ where }),
      db.vehicle.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: withBranch }),
    ]);
    const photos = await primaryPhotosByVehicle(db, rows.map((r) => r.id));
    return page(
      rows.map((r) => toDto(r, org, showCosts, photos.get(r.id)?.url ?? null)),
      total,
      q.page,
      q.pageSize
    );
  });
}

export async function listVehicleMakes(ctx: AuthContext): Promise<string[]> {
  const scope = requirePermission(ctx, "vehicles", "read");
  const rows = await withTenant(ctx, (db) =>
    db.vehicle.findMany({
      where: scopeWhere(ctx, scope, VEHICLE_SCOPE),
      distinct: ["make"],
      select: { make: true },
      orderBy: { make: "asc" },
    })
  );
  return rows.map((r) => r.make);
}

export async function getVehicle(ctx: AuthContext, vehicleId: string): Promise<VehicleDto> {
  const scope = requirePermission(ctx, "vehicles", "read");
  return withTenant(ctx, async (db) => {
    const [org, row] = await Promise.all([
      orgFacts(db),
      db.vehicle.findFirst({ where: { id: vehicleId }, include: withBranch }),
    ]);
    // Another organization's vehicle, one outside the caller's branches, and a missing one are all the same 404.
    if (!row || !scopeAllows(ctx, scope, VEHICLE_SCOPE, row)) throw notFound("Vehicle not found.");
    const photo = (await primaryPhotosByVehicle(db, [row.id])).get(row.id) ?? null;
    return toDto(row, org, can(ctx, "profit", "read"), photo?.url ?? null);
  });
}

/** The branch must exist here and be one the caller may act in (a narrow scope cannot file a vehicle elsewhere). */
async function checkBranch(ctx: AuthContext, db: TenantDb, scope: string, branchId: string) {
  const branch = await db.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } });
  if (!branch || (scope !== "organization" && !ctx.branchIds.includes(branchId))) throw notFound("Branch not found.");
}

function requireCostAccess(ctx: AuthContext, body: Record<string, unknown>) {
  if (COST_FIELDS.some((f) => body[f] !== undefined) && !can(ctx, "profit", "read")) {
    throw forbidden("You do not have access to cost figures.");
  }
}

export async function createVehicle(
  ctx: AuthContext,
  input: CreateVehicleInput,
  meta?: RequestMeta
): Promise<VehicleDto> {
  // A generated stock number can clash with a concurrent create (the failed statement aborts the transaction), so the
  // whole create is repeated with a fresh number. A number the caller chose is never retried.
  for (let attempt = 1; ; attempt++) {
    try {
      return await createVehicleOnce(ctx, input, meta);
    } catch (error) {
      const clash = describeDatabaseError(error)?.prismaCode === "P2002";
      if (input.stockNumber || !clash || attempt >= 3) throw error;
    }
  }
}

async function createVehicleOnce(ctx: AuthContext, input: CreateVehicleInput, meta?: RequestMeta): Promise<VehicleDto> {
  const scope = requirePermission(ctx, "vehicles", "create");
  requireCostAccess(ctx, input);
  if (input.status === "sold") {
    throw conflict("A vehicle becomes sold by completing a deal, not by editing it.", "business_rule");
  }
  return withTenant(ctx, async (db) => {
    if (input.branchId) await checkBranch(ctx, db, scope, input.branchId);
    const org = await orgFacts(db);
    // A person with a narrow scope files the vehicle in their own branch unless they pick another they belong to.
    const branchId = input.branchId ?? (scope === "organization" ? undefined : ctx.branchIds[0]);
    if (scope !== "organization" && !branchId) throw forbidden("You are not assigned to a branch.");
    const stockNumber = input.stockNumber ?? (await nextStockNumber(db));
    const row = await db.vehicle.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        stockNumber,
        vin: input.vin,
        make: input.make,
        model: input.model,
        trim: input.trim,
        year: input.year,
        condition: toEnumInput(input.condition),
        status: toEnumInput(input.status),
        mileageKm: input.mileageKm,
        listPrice: input.listPrice,
        expectedSellingPrice: input.expectedSellingPrice,
        estimatedMarketValue: input.estimatedMarketValue,
        purchasePrice: input.purchasePrice ?? 0,
        repairCost: input.repairCost ?? 0,
        transportCost: input.transportCost ?? 0,
        otherCost: input.otherCost ?? 0,
        emirate: input.emirate ? toEnumInput(input.emirate) : undefined,
        importSpec: input.importSpec ? toEnumInput(input.importSpec) : undefined,
        sourceType: input.sourceType ? toEnumInput(input.sourceType) : undefined,
        location: input.location,
        spec: input.spec ?? {},
        registration: input.registration ?? {},
        notes: input.notes,
        featured: input.featured ?? false,
      },
      include: withBranch,
    });
    await recordAudit(db, ctx, {
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: row.id,
      metadata: { stockNumber, status: input.status },
      ...meta,
    });
    return toDto(row, org, can(ctx, "profit", "read"));
  });
}

export async function updateVehicle(
  ctx: AuthContext,
  vehicleId: string,
  input: UpdateVehicleInput,
  meta?: RequestMeta
): Promise<VehicleDto> {
  const scope = requirePermission(ctx, "vehicles", "update");
  requireCostAccess(ctx, input);
  return withTenant(ctx, async (db) => {
    const existing = await db.vehicle.findFirst({ where: { id: vehicleId } });
    if (!existing || !scopeAllows(ctx, scope, VEHICLE_SCOPE, existing)) throw notFound("Vehicle not found.");
    if (existing.status === "SOLD") {
      throw conflict("A sold vehicle is a financial record and cannot be changed.", "business_rule");
    }
    if (input.status === "sold") {
      throw conflict("A vehicle becomes sold by completing a deal, not by editing it.", "business_rule");
    }
    if (input.branchId) await checkBranch(ctx, db, scope, input.branchId);
    const org = await orgFacts(db);
    const { spec, registration, status, condition, emirate, importSpec, sourceType, ...rest } = input;
    const data: Prisma.VehicleUncheckedUpdateInput = {
      ...(rest as Prisma.VehicleUncheckedUpdateInput),
      ...(status ? { status: toEnumInput(status) } : {}),
      ...(condition ? { condition: toEnumInput(condition) } : {}),
      ...(emirate !== undefined ? { emirate: emirate ? toEnumInput(emirate) : null } : {}),
      ...(importSpec !== undefined ? { importSpec: importSpec ? toEnumInput(importSpec) : null } : {}),
      ...(sourceType !== undefined ? { sourceType: sourceType ? toEnumInput(sourceType) : null } : {}),
      // The JSON documents are replaced as a whole by the form, so a field cleared in the UI really disappears.
      ...(spec ? { spec } : {}),
      ...(registration ? { registration } : {}),
    };
    // A changed price means any USD purchase record no longer explains purchase_price (a database rule).
    if (input.purchasePrice !== undefined) {
      Object.assign(data, { purchaseCurrency: null, purchaseAmountOriginal: null, purchaseFxRate: null });
    }
    const row = await db.vehicle.update({ where: { id: vehicleId }, data, include: withBranch });
    // This app never hard-deletes a vehicle (every other table references it, and losing purchase/deal
    // history would be wrong for a financial record) — archiving IS the "remove from inventory" action, so
    // it gets its own audit action rather than blending into every other field edit as "vehicle.updated".
    await recordAudit(db, ctx, {
      action: input.status === "archived" && existing.status !== "ARCHIVED" ? "vehicle.archived" : "vehicle.updated",
      entityType: "vehicle",
      entityId: vehicleId,
      // Field names only: values (prices, costs) do not belong in the audit trail's metadata.
      metadata: { fields: Object.keys(input).sort().join(",") },
      ...meta,
    });
    // "Vehicle price change" (§27): tells whoever is working a lead on THIS car, not a fabricated "watcher" —
    // there is no per-vehicle ownership/subscription model, but an active lead genuinely pointed at it is.
    if (input.listPrice !== undefined && Number(existing.listPrice) !== input.listPrice) {
      const interested = await db.lead.findMany({
        where: { interestedVehicleId: vehicleId, stage: { notIn: ["WON", "LOST"] }, assignedToId: { not: null } },
        select: { assignedToId: true },
        distinct: ["assignedToId"],
      });
      const label = `${row.year} ${row.make} ${row.model}`.trim();
      const price = `${input.listPrice.toLocaleString()} ${org.currency}`;
      for (const lead of interested) {
        await notifyUser(db, ctx, {
          userId: lead.assignedToId!,
          kind: "PRICE",
          title: "Vehicle price change",
          description: `${label} is now ${price}`,
          link: `/inventory/${vehicleId}`,
        });
      }
    }
    const photo = (await primaryPhotosByVehicle(db, [row.id])).get(row.id) ?? null;
    return toDto(row, org, can(ctx, "profit", "read"), photo?.url ?? null);
  });
}

/** STK-<yy><3-digit sequence>: one more than the highest number of the same prefix (the caller retries on a clash). */
async function nextStockNumber(db: TenantDb): Promise<string> {
  const prefix = `STK-${String(new Date().getUTCFullYear()).slice(2)}`;
  const last = await db.vehicle.findFirst({
    where: { stockNumber: { startsWith: prefix } },
    orderBy: { stockNumber: "desc" },
    select: { stockNumber: true },
  });
  const seq = last ? Number(last.stockNumber.slice(prefix.length)) : 0;
  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(3, "0")}`;
}

const toEnumInput = (v: string) => v.toUpperCase() as never;
