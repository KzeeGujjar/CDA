import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { can, requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { forbidden, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { notifyUser } from "@/server/modules/notifications/notifications.service";
import { id, likeSafe, money, page, parseQuery, toEnum } from "@/server/modules/crm-common";

/**
 * Leads. A role sees only the leads its scope reaches (own = assigned to them, branch = their branches). Customer
 * contact details need customers:read and the vehicle label needs vehicles:read; without them those parts are null.
 * The interaction log (calls, WhatsApp, visits) has no backing model yet, so it is not part of this API.
 */
const STAGES = ["new", "contacted", "qualified", "viewing", "negotiation", "won", "lost"] as const;
const SOURCES = ["website", "walk_in", "referral", "social_media", "marketplace", "phone"] as const;
const STARTING_SCORE = 30;

const budget = z
  .number()
  .min(0)
  .max(100_000_000_000)
  .transform((n) => Math.round(n * 100) / 100);
const when = z.iso.datetime({ offset: true });

export const createLeadSchema = z.strictObject({
  customerId: id,
  source: z.enum(SOURCES),
  interestedVehicleId: id.optional(),
  budget: budget.optional(),
  /** Who works the lead. Defaults to the caller; a role with "own" scope can only pick themselves. */
  assignedToId: id.optional(),
  nextFollowUpAt: when.optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z
  .strictObject({
    stage: z.enum(STAGES),
    nextFollowUpAt: when.nullable(),
    assignedToId: id,
    budget: budget.nullable(),
    interestedVehicleId: id.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const listLeadsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  stage: z.enum(STAGES).optional(),
  assignedToId: id.optional(),
  /** Every lead for one customer (the customer detail page's overview and timeline). */
  customerId: id.optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export interface LeadDto {
  id: string;
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
  interestedVehicle: { id: string; label: string | null } | null;
  currency: string;
  budget: number | null;
  stage: string;
  source: string;
  score: number;
  assignedTo: { id: string; name: string } | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const LEAD_SCOPE = { ownerField: "assignedToId", branchField: "branchId" } as const;

const include = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  assignedTo: { select: { id: true, name: true } },
  interestedVehicle: { select: { id: true, year: true, make: true, model: true, trim: true } },
} as const;
type LeadRow = Prisma.LeadGetPayload<{ include: typeof include }>;

function toDto(l: LeadRow, currency: string, ctx: AuthContext): LeadDto {
  const seeCustomer = can(ctx, "customers", "read");
  const seeVehicle = can(ctx, "vehicles", "read");
  return {
    id: l.id,
    customer: {
      id: l.customer.id,
      name: seeCustomer ? l.customer.name : null,
      email: seeCustomer ? l.customer.email : null,
      phone: seeCustomer ? l.customer.phone : null,
    },
    interestedVehicle: l.interestedVehicle
      ? {
          id: l.interestedVehicle.id,
          label: seeVehicle
            ? [l.interestedVehicle.year, l.interestedVehicle.make, l.interestedVehicle.model, l.interestedVehicle.trim]
                .filter(Boolean)
                .join(" ")
            : null,
        }
      : null,
    currency,
    budget: l.budget ? money(l.budget) : null,
    stage: toEnum(l.stage),
    source: toEnum(l.source),
    score: l.score,
    assignedTo: l.assignedTo,
    lastContactAt: l.lastContactAt?.toISOString() ?? null,
    nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

const orgCurrency = async (db: TenantDb) =>
  (await db.organization.findFirstOrThrow({ select: { currency: true } })).currency;

/**
 * Free-text search. A caller may only search what they may read: customer details need customers:read and the vehicle
 * needs vehicles:read. A caller who may search neither gets NO results for any text (never "the search is ignored"),
 * so a search cannot be used to probe details they cannot see.
 */
function searchClause(ctx: AuthContext, s: string): Prisma.LeadWhereInput {
  const like = { contains: s, mode: "insensitive" as const };
  const clauses: Prisma.LeadWhereInput[] = [
    ...(can(ctx, "customers", "read")
      ? [{ customer: { name: like } }, { customer: { email: like } }, { customer: { phone: like } }]
      : []),
    ...(can(ctx, "vehicles", "read")
      ? [{ interestedVehicle: { make: like } }, { interestedVehicle: { model: like } }]
      : []),
  ];
  return clauses.length ? { OR: clauses } : { id: { in: [] } };
}

export async function listLeads(ctx: AuthContext, query: URLSearchParams) {
  const scope = requirePermission(ctx, "leads", "read");
  const q = parseQuery(listLeadsQuerySchema, query);
  const s = q.search ? likeSafe(q.search) : undefined;
  const where: Prisma.LeadWhereInput = {
    AND: [
      scopeWhere(ctx, scope, LEAD_SCOPE),
      ...(q.stage ? [{ stage: q.stage.toUpperCase() as never }] : []),
      ...(q.assignedToId ? [{ assignedToId: q.assignedToId }] : []),
      ...(q.customerId ? [{ customerId: q.customerId }] : []),
      ...(s ? [searchClause(ctx, s)] : []),
    ],
  };
  return withTenant(ctx, async (db) => {
    const [currency, total, rows] = await Promise.all([
      orgCurrency(db),
      db.lead.count({ where }),
      db.lead.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return page(
      rows.map((r) => toDto(r, currency, ctx)),
      total,
      q.page,
      q.pageSize
    );
  });
}

export async function getLead(ctx: AuthContext, leadId: string): Promise<LeadDto> {
  const scope = requirePermission(ctx, "leads", "read");
  return withTenant(ctx, async (db) => {
    const [currency, row] = await Promise.all([orgCurrency(db), db.lead.findFirst({ where: { id: leadId }, include })]);
    if (!row || !scopeAllows(ctx, scope, LEAD_SCOPE, row)) throw notFound("Lead not found.");
    return toDto(row, currency, ctx);
  });
}

/** Who may work a lead: an active person of this organization; a role with "own" scope can only pick themselves. */
async function checkAssignee(ctx: AuthContext, db: TenantDb, scope: string, assigneeId: string) {
  if (scope === "own" && assigneeId !== ctx.userId) throw forbidden("You can only assign leads to yourself.");
  const user = await db.user.findFirst({
    where: { id: assigneeId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!user) throw notFound("The person to assign the lead to was not found.");
}

/** The vehicle must exist here and be one the caller may see. */
async function checkVehicle(ctx: AuthContext, db: TenantDb, vehicleId: string): Promise<{ branchId: string | null }> {
  const vehicleScope = requirePermission(ctx, "vehicles", "read");
  const v = await db.vehicle.findFirst({ where: { id: vehicleId }, select: { id: true, branchId: true } });
  if (!v || !scopeAllows(ctx, vehicleScope, { branchField: "branchId" }, v)) throw notFound("Vehicle not found.");
  return { branchId: v.branchId };
}

export async function createLead(ctx: AuthContext, input: CreateLeadInput, meta?: RequestMeta): Promise<LeadDto> {
  const scope = requirePermission(ctx, "leads", "create");
  const customerScope = requirePermission(ctx, "customers", "read");
  return withTenant(ctx, async (db) => {
    const customer = await db.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer || !scopeAllows(ctx, customerScope, {}, customer)) throw notFound("Customer not found.");
    const vehicle = input.interestedVehicleId ? await checkVehicle(ctx, db, input.interestedVehicleId) : null;
    const assigneeId = input.assignedToId ?? ctx.userId;
    await checkAssignee(ctx, db, scope, assigneeId);
    const currency = await orgCurrency(db);
    const row = await db.lead.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        interestedVehicleId: input.interestedVehicleId,
        // Filed under the vehicle's branch, else the creator's own, so a branch-scoped colleague can see it.
        branchId: vehicle?.branchId ?? ctx.branchIds[0],
        assignedToId: assigneeId,
        source: input.source.toUpperCase() as never,
        stage: "NEW",
        score: STARTING_SCORE,
        budget: input.budget,
        nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : undefined,
      },
      include,
    });
    await recordAudit(db, ctx, {
      action: "lead.created",
      entityType: "lead",
      entityId: row.id,
      metadata: { source: input.source },
      ...meta,
    });
    // "New lead" (§27): only worth notifying about when it lands on someone ELSE's desk — self-assigning your
    // own lead (the default, assigneeId ?? ctx.userId) is not news to you.
    if (assigneeId !== ctx.userId) {
      await notifyUser(db, ctx, {
        userId: assigneeId,
        kind: "LEAD",
        title: "New lead",
        description: `${customer.name} (${input.source.replace("_", " ")})`,
        link: `/leads/${row.id}`,
      });
    }
    return toDto(row, currency, ctx);
  });
}

export async function updateLead(
  ctx: AuthContext,
  leadId: string,
  input: UpdateLeadInput,
  meta?: RequestMeta
): Promise<LeadDto> {
  const scope = requirePermission(ctx, "leads", "update");
  return withTenant(ctx, async (db) => {
    const existing = await db.lead.findFirst({ where: { id: leadId } });
    if (!existing || !scopeAllows(ctx, scope, LEAD_SCOPE, existing)) throw notFound("Lead not found.");
    if (input.assignedToId) await checkAssignee(ctx, db, scope, input.assignedToId);
    if (input.interestedVehicleId) await checkVehicle(ctx, db, input.interestedVehicleId);
    const currency = await orgCurrency(db);
    const { stage, nextFollowUpAt, ...rest } = input;
    const row = await db.lead.update({
      where: { id: leadId },
      data: {
        ...rest,
        ...(stage ? { stage: stage.toUpperCase() as never } : {}),
        ...(nextFollowUpAt !== undefined
          ? { nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null, followUpRemindedAt: null }
          : {}),
      },
      include,
    });
    await recordAudit(db, ctx, {
      action: "lead.updated",
      entityType: "lead",
      entityId: leadId,
      metadata: { fields: Object.keys(input).sort().join(","), ...(stage ? { stage } : {}) },
      ...meta,
    });
    return toDto(row, currency, ctx);
  });
}
