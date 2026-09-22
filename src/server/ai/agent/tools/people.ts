import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { notFound } from "@/server/lib/errors";
import { defineTool } from "../types";
import { maskEmail, maskPhone } from "../mask";

const num = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? null : Number(d));
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const leadStages = ["new", "contacted", "qualified", "viewing", "negotiation", "won", "lost"] as const;

export const searchCustomers = defineTool({
  name: "searchCustomers",
  description:
    "Search customers by name, email or phone (up to 20 results). For privacy, emails and phone numbers are returned MASKED (enough to tell people apart, not to contact them); tell the user to open the customer record for full contact details.",
  schema: z.strictObject({
    query: z.string().trim().min(2).max(100).describe("Part of a name, email or phone number."),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  requires: [["customers", "read"]],
  confirm: false,
  summarize: (r) => `Found ${(r as { count: number }).count} customer(s)`,
  async execute(ctx, db, a) {
    const scope = requirePermission(ctx, "customers", "read");
    const contains = (f: "name" | "email" | "phone"): Prisma.CustomerWhereInput => ({
      [f]: { contains: a.query, mode: "insensitive" },
    });
    const rows = await db.customer.findMany({
      where: {
        AND: [
          scopeWhere(ctx, scope, {}) as Prisma.CustomerWhereInput,
          { deletedAt: null },
          { OR: [contains("name"), contains("email"), contains("phone")] },
        ],
      },
      orderBy: { name: "asc" },
      take: a.limit,
    });
    return {
      count: rows.length,
      customers: rows.map((c) => ({ id: c.id, name: c.name, email: maskEmail(c.email), phone: maskPhone(c.phone) })),
    };
  },
});

export const getCustomer = defineTool({
  name: "getCustomer",
  description:
    "Get one customer by id: name, masked contact details, and (only if the current user may see them) how many leads and deals the customer has and their most recent leads.",
  schema: z.strictObject({ customerId: id }),
  requires: [["customers", "read"]],
  confirm: false,
  summarize: () => "Read one customer",
  async execute(ctx, db, a) {
    const scope = requirePermission(ctx, "customers", "read");
    const c = await db.customer.findFirst({ where: { id: a.customerId, deletedAt: null } });
    if (!c || !scopeAllows(ctx, scope, {}, c)) throw notFound("Customer not found.");
    const out: Record<string, unknown> = {
      id: c.id,
      name: c.name,
      email: maskEmail(c.email),
      phone: maskPhone(c.phone),
      customerSince: c.createdAt.toISOString().slice(0, 10),
    };
    if (can(ctx, "leads", "read")) {
      const ls = requirePermission(ctx, "leads", "read");
      const where = {
        AND: [
          scopeWhere(ctx, ls, { ownerField: "assignedToId", branchField: "branchId" }) as Prisma.LeadWhereInput,
          { customerId: c.id },
        ],
      };
      const [count, recent] = await Promise.all([
        db.lead.count({ where }),
        db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: 5 }),
      ]);
      out.leads = {
        count,
        recent: recent.map((l) => ({
          id: l.id,
          stage: l.stage.toLowerCase(),
          source: l.source.toLowerCase(),
          score: l.score,
        })),
      };
    }
    if (can(ctx, "deals", "read")) {
      const ds = requirePermission(ctx, "deals", "read");
      out.dealsCount = await db.deal.count({
        where: {
          AND: [
            scopeWhere(ctx, ds, { ownerField: "salespersonId", branchField: "branchId" }) as Prisma.DealWhereInput,
            { customerId: c.id },
          ],
        },
      });
    }
    return out;
  },
});

export const searchLeads = defineTool({
  name: "searchLeads",
  description:
    "Search sales leads (up to 20). Filter by stage, by text in the customer's name, or only the leads assigned to the current user. A salesperson only ever sees their own leads.",
  schema: z.strictObject({
    stage: z.enum(leadStages).optional(),
    query: z.string().trim().min(1).max(100).optional().describe("Part of the customer's name."),
    assignedToMe: z.boolean().optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  requires: [["leads", "read"]],
  confirm: false,
  summarize: (r) => `Found ${(r as { count: number }).count} lead(s)`,
  async execute(ctx, db, a) {
    const scope = requirePermission(ctx, "leads", "read");
    const showNames = can(ctx, "customers", "read");
    const rows = await db.lead.findMany({
      where: {
        AND: [
          scopeWhere(ctx, scope, { ownerField: "assignedToId", branchField: "branchId" }) as Prisma.LeadWhereInput,
          ...(a.stage ? [{ stage: a.stage.toUpperCase() as never }] : []),
          ...(a.assignedToMe ? [{ assignedToId: ctx.userId }] : []),
          ...(a.query && showNames
            ? [{ customer: { is: { name: { contains: a.query, mode: "insensitive" as const } } } }]
            : []),
        ],
      },
      include: {
        customer: { select: { id: true, name: true } },
        interestedVehicle: { select: { year: true, make: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
      take: a.limit,
    });
    return {
      count: rows.length,
      leads: rows.map((l) => ({
        id: l.id,
        customerId: l.customer.id,
        customerName: showNames ? l.customer.name : null,
        stage: l.stage.toLowerCase(),
        source: l.source.toLowerCase(),
        score: l.score,
        budget: num(l.budget),
        interestedIn: l.interestedVehicle
          ? `${l.interestedVehicle.year} ${l.interestedVehicle.make} ${l.interestedVehicle.model}`
          : null,
        createdAt: l.createdAt.toISOString().slice(0, 10),
        nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
      })),
    };
  },
});
