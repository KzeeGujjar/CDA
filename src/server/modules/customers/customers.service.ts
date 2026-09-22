import { z } from "zod";
import type { Customer, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { emailSchema } from "@/server/auth/flows/common";
import { can, permissionScope, requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { likeSafe, money, page, parseQuery } from "@/server/modules/crm-common";

/**
 * Customers. The table holds a name and contact details only; everything else the customer screens show (tags,
 * nationality, notes, calls, messages) has no backing model yet. "Lifetime value" is computed here, from the
 * caller's own view of completed deals, so it is `null` for a role that cannot read deals.
 * This table has no owner or branch column, so only an organization-wide scope can read it (narrower ones see nothing).
 */
const phone = z.string().trim().max(40);

export const createCustomerSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: emailSchema.optional(),
  phone: phone.optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    email: emailSchema.nullable(),
    phone: phone.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export interface CustomerDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currency: string;
  /** Sum of the caller-visible completed deals (sale price, excluding VAT). null when the caller cannot read deals. */
  lifetimeValue: number | null;
  createdAt: string;
}

const DEAL_SCOPE = { ownerField: "salespersonId", branchField: "branchId" } as const;

async function lifetimeValues(
  ctx: AuthContext,
  db: Parameters<Parameters<typeof withTenant>[1]>[0],
  ids: string[]
): Promise<Map<string, number> | null> {
  const dealScope = permissionScope(ctx, "deals", "read");
  if (!dealScope) return null;
  const sums = await db.deal.groupBy({
    by: ["customerId"],
    where: { AND: [scopeWhere(ctx, dealScope, DEAL_SCOPE), { status: "COMPLETED" }, { customerId: { in: ids } }] },
    _sum: { salePrice: true },
  });
  return new Map(sums.map((s) => [s.customerId, s._sum.salePrice ? money(s._sum.salePrice) : 0]));
}

function toDto(c: Customer, currency: string, values: Map<string, number> | null): CustomerDto {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    currency,
    lifetimeValue: values === null ? null : (values.get(c.id) ?? 0),
    createdAt: c.createdAt.toISOString(),
  };
}

export async function listCustomers(ctx: AuthContext, query: URLSearchParams) {
  const scope = requirePermission(ctx, "customers", "read");
  const q = parseQuery(listCustomersQuerySchema, query);
  const s = q.search ? likeSafe(q.search) : undefined;
  const where: Prisma.CustomerWhereInput = {
    AND: [
      { deletedAt: null },
      scopeWhere(ctx, scope, {}),
      ...(s
        ? [
            {
              OR: [
                { name: { contains: s, mode: "insensitive" as const } },
                { email: { contains: s, mode: "insensitive" as const } },
                { phone: { contains: s, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };
  return withTenant(ctx, async (db) => {
    const [org, total, rows] = await Promise.all([
      db.organization.findFirstOrThrow({ select: { currency: true } }),
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const values = await lifetimeValues(
      ctx,
      db,
      rows.map((r) => r.id)
    );
    return page(
      rows.map((r) => toDto(r, org.currency, values)),
      total,
      q.page,
      q.pageSize
    );
  });
}

export async function getCustomer(ctx: AuthContext, customerId: string): Promise<CustomerDto> {
  const scope = requirePermission(ctx, "customers", "read");
  return withTenant(ctx, async (db) => {
    const [org, row] = await Promise.all([
      db.organization.findFirstOrThrow({ select: { currency: true } }),
      db.customer.findFirst({ where: { id: customerId, deletedAt: null } }),
    ]);
    if (!row || !scopeAllows(ctx, scope, {}, row)) throw notFound("Customer not found.");
    return toDto(row, org.currency, await lifetimeValues(ctx, db, [row.id]));
  });
}

export async function createCustomer(
  ctx: AuthContext,
  input: CreateCustomerInput,
  meta?: RequestMeta
): Promise<CustomerDto> {
  requirePermission(ctx, "customers", "create");
  return withTenant(ctx, async (db) => {
    const [org, row] = await Promise.all([
      db.organization.findFirstOrThrow({ select: { currency: true } }),
      db.customer.create({
        data: { organizationId: ctx.organizationId, name: input.name, email: input.email, phone: input.phone },
      }),
    ]);
    await recordAudit(db, ctx, { action: "customer.created", entityType: "customer", entityId: row.id, ...meta });
    // A new customer has no deals yet, so their value is 0 (or unknown when the role cannot read deals).
    return toDto(row, org.currency, can(ctx, "deals", "read") ? new Map() : null);
  });
}

export async function updateCustomer(
  ctx: AuthContext,
  customerId: string,
  input: UpdateCustomerInput,
  meta?: RequestMeta
): Promise<CustomerDto> {
  const scope = requirePermission(ctx, "customers", "update");
  return withTenant(ctx, async (db) => {
    const existing = await db.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!existing || !scopeAllows(ctx, scope, {}, existing)) throw notFound("Customer not found.");
    const [org, row] = await Promise.all([
      db.organization.findFirstOrThrow({ select: { currency: true } }),
      db.customer.update({ where: { id: customerId }, data: input }),
    ]);
    await recordAudit(db, ctx, {
      action: "customer.updated",
      entityType: "customer",
      entityId: customerId,
      // Field names only: contact details do not belong in the audit trail's metadata.
      metadata: { fields: Object.keys(input).sort().join(",") },
      ...meta,
    });
    return toDto(row, org.currency, await lifetimeValues(ctx, db, [row.id]));
  });
}
