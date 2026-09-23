import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { DocumentType, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { appUrl } from "@/server/env";
import { forbidden, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { DEFAULT_TEMPLATES } from "./default-templates";
import { extractVariables, renderTemplate } from "./render";

/**
 * Document generation (§0.22): a real internal template + generated-document model. Templates are versioned
 * (editing never mutates a row — it creates the next version, see createTemplate); Generate renders the
 * organization's active template for a type (or, if none exists yet, the built-in default) against real
 * vehicle/customer/deal/dealer facts and freezes the result as a plain-text snapshot. Preview, Download,
 * Print and Share all show that exact same snapshot — nothing is ever recomputed differently for one action
 * than another. See src/server/modules/documents/render.ts for how {{tokens}} are substituted (never
 * executed) and default-templates.ts for the built-in English wording.
 */

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "is not a valid id");
const languageValues = ["en", "ar", "hi", "ur"] as const;

export const documentTypeValues = [
  "quotation",
  "invoice",
  "receipt",
  "purchase_agreement",
  "sales_agreement",
  "inspection_report",
  "delivery_form",
  "customer_agreement",
] as const;
export const documentStatusValues = ["draft", "pending_signature", "signed", "completed"] as const;

const DEFAULT_TITLES: Record<(typeof documentTypeValues)[number], string> = {
  quotation: "Quotation",
  invoice: "Tax Invoice",
  receipt: "Payment Receipt",
  purchase_agreement: "Vehicle Purchase Agreement",
  sales_agreement: "Vehicle Sales Agreement",
  inspection_report: "Vehicle Inspection Report",
  delivery_form: "Vehicle Delivery Form",
  customer_agreement: "Customer Agreement",
};

const SHARE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export const createDocumentSchema = z.strictObject({
  type: z.enum(documentTypeValues),
  title: z.string().trim().min(1).max(200).optional(),
  vehicleId: idSchema.optional(),
  customerId: idSchema.optional(),
  dealId: idSchema.optional(),
  language: z.enum(languageValues).default("en"),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    vehicleId: idSchema.nullable().optional(),
    customerId: idSchema.nullable().optional(),
    dealId: idSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const updateDocumentStatusSchema = z.strictObject({ status: z.enum(documentStatusValues) });

export const listDocumentsQuerySchema = z.strictObject({
  search: z.string().trim().min(1).max(100).optional(),
  type: z.enum(documentTypeValues).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const createTemplateSchema = z.strictObject({
  type: z.enum(documentTypeValues),
  language: z.enum(languageValues).default("en"),
  name: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  activate: z.boolean().default(true),
});

export const listTemplatesQuerySchema = z.strictObject({ type: z.enum(documentTypeValues).optional() });

const parseQuery = <T>(schema: z.ZodType<T>, query: URLSearchParams): T => schema.parse(Object.fromEntries(query.entries()));
const up = (v: string) => v.toUpperCase() as never;
const down = (v: string) => v.toLowerCase();

export interface DocumentDto {
  id: string;
  type: string;
  title: string;
  status: string;
  language: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  dealId: string | null;
  dealReference: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  hasActiveShare: boolean;
}
export interface DocumentDetailDto extends DocumentDto {
  content: string;
}

type DocumentRow = Prisma.GeneratedDocumentGetPayload<{
  include: {
    vehicle: { select: { year: true; make: true; model: true; trim: true } };
    customer: { select: { name: true } };
    deal: { select: { reference: true } };
    createdBy: { select: { name: true } };
  };
}>;

const rowInclude = {
  vehicle: { select: { year: true, make: true, model: true, trim: true } },
  customer: { select: { name: true } },
  deal: { select: { reference: true } },
  createdBy: { select: { name: true } },
} as const;

function toDto(row: DocumentRow): DocumentDto {
  return {
    id: row.id,
    type: down(row.type),
    title: row.title,
    status: down(row.status),
    language: row.language,
    vehicleId: row.vehicleId,
    vehicleLabel: row.vehicle ? `${row.vehicle.year} ${row.vehicle.make} ${row.vehicle.model}${row.vehicle.trim ? ` ${row.vehicle.trim}` : ""}` : null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    dealId: row.dealId,
    dealReference: row.deal?.reference ?? null,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    hasActiveShare: Boolean(row.shareToken && row.shareExpiresAt && row.shareExpiresAt > new Date()),
  };
}
const toDetailDto = (row: DocumentRow): DocumentDetailDto => ({ ...toDto(row), content: row.content });

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  return formatted.replace(/^([A-Z]{2,3})\s*/, "$1 ");
}

interface LinkageInput {
  vehicleId?: string | null;
  customerId?: string | null;
  dealId?: string | null;
}

/**
 * Resolves every {{variable}} a template might use, from real rows only — never a client-supplied value.
 * Deliberately does NOT require vehicles:read/customers:read/deals:read beyond documents:create: the same
 * choice made for AI Marketing (src/server/modules/marketing/marketing.service.ts) and for the same reason —
 * no cost/profit figure is ever included here, only facts a customer-facing document legitimately shows.
 */
async function buildVariables(db: TenantDb, linkage: LinkageInput) {
  const org = await db.organization.findFirstOrThrow({
    select: { name: true, address: true, city: true, phone: true, taxNumber: true, currency: true },
  });
  const dealerLine = [org.name, org.address, org.city].filter(Boolean).join(", ") || org.name;

  const vehicle = linkage.vehicleId ? await db.vehicle.findFirst({ where: { id: linkage.vehicleId } }) : null;
  if (linkage.vehicleId && !vehicle) throw notFound("Vehicle not found.");
  const customer = linkage.customerId
    ? await db.customer.findFirst({ where: { id: linkage.customerId, deletedAt: null } })
    : null;
  if (linkage.customerId && !customer) throw notFound("Customer not found.");
  const deal = linkage.dealId ? await db.deal.findFirst({ where: { id: linkage.dealId } }) : null;
  if (linkage.dealId && !deal) throw notFound("Deal not found.");

  const spec = (vehicle?.spec ?? {}) as Record<string, unknown>;
  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}` : null;
  const priceAmount = deal ? Number(deal.salePrice) : vehicle ? Number(vehicle.expectedSellingPrice ?? vehicle.listPrice) : null;
  const vatAmount = deal ? Number(deal.vatAmount) : priceAmount !== null ? Math.round(priceAmount * 0.05) : null;

  const variables = {
    date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
    dealer: {
      line: dealerLine,
      name: org.name,
      phone: org.phone ?? "",
      taxLine: org.taxNumber ? `TRN: ${org.taxNumber}` : "",
    },
    vehicle: {
      line: vehicle ? `${vehicleLabel} (VIN: ${vehicle.vin ?? "not recorded"})` : "[Vehicle details pending]",
      label: vehicleLabel ?? "",
      vin: vehicle?.vin ?? "",
      accidentHistory: spec.accidentHistory ?? "[Pending]",
      serviceHistory: spec.serviceHistory ?? "[Pending]",
      mileageLine: vehicle?.mileageKm != null ? `${vehicle.mileageKm.toLocaleString()} km` : "[Pending]",
    },
    customer: {
      line: customer
        ? `${customer.name} (${customer.phone ?? "no phone on file"}, ${customer.email ?? "no email on file"})`
        : "[Customer details pending]",
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
    },
    deal: deal ? { reference: deal.reference } : null,
    price: priceAmount !== null ? formatMoney(priceAmount, org.currency) : "[Amount pending]",
    vat: vatAmount !== null ? formatMoney(vatAmount, org.currency) : "[VAT pending]",
  };

  return { variables, vehicle, customer, deal };
}

async function getActiveTemplate(db: TenantDb, type: DocumentType, language: string) {
  const row = await db.documentTemplate.findFirst({ where: { type, language, isActive: true } });
  if (row) return { id: row.id as string | null, version: row.version as number | null, content: row.content };
  // No custom template for this (type, language) yet — the built-in default IS the active template.
  return { id: null, version: null, content: DEFAULT_TEMPLATES[type] };
}

async function renderDocument(
  db: TenantDb,
  input: { type: (typeof documentTypeValues)[number]; language: string } & LinkageInput
) {
  const { variables, vehicle, customer, deal } = await buildVariables(db, input);
  const template = await getActiveTemplate(db, up(input.type), input.language);
  return {
    content: renderTemplate(template.content, variables),
    variables: variables as unknown as Prisma.InputJsonValue,
    templateId: template.id,
    templateVersion: template.version,
    vehicle,
    customer,
    deal,
  };
}

export async function listDocuments(ctx: AuthContext, query: URLSearchParams): Promise<{ items: DocumentDto[]; total: number }> {
  const scope = requirePermission(ctx, "documents", "read");
  const q = parseQuery(listDocumentsQuerySchema, query);
  const where: Prisma.GeneratedDocumentWhereInput = {
    AND: [
      scopeWhere(ctx, scope, { ownerField: "createdById" }) as Prisma.GeneratedDocumentWhereInput,
      q.type ? { type: up(q.type) } : {},
      q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: "insensitive" } },
              { vehicle: { is: { OR: [{ make: { contains: q.search, mode: "insensitive" } }, { model: { contains: q.search, mode: "insensitive" } }] } } },
              { customer: { is: { name: { contains: q.search, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };
  return withTenant(ctx, async (db) => {
    const [rows, total] = await Promise.all([
      db.generatedDocument.findMany({ where, include: rowInclude, orderBy: { updatedAt: "desc" }, take: q.limit, skip: q.offset }),
      db.generatedDocument.count({ where }),
    ]);
    return { items: rows.map(toDto), total };
  });
}

export async function getDocumentById(ctx: AuthContext, id: string): Promise<DocumentDetailDto> {
  const scope = requirePermission(ctx, "documents", "read");
  return withTenant(ctx, async (db) => {
    const row = await db.generatedDocument.findFirst({ where: { id }, include: rowInclude });
    if (!row || !scopeAllows(ctx, scope, { ownerField: "createdById" }, row)) throw notFound("Document not found.");
    return toDetailDto(row);
  });
}

export async function createDocument(
  ctx: AuthContext,
  input: CreateDocumentInput,
  meta?: RequestMeta
): Promise<DocumentDetailDto> {
  requirePermission(ctx, "documents", "create");
  return withTenant(ctx, async (db) => {
    const rendered = await renderDocument(db, input);
    const row = await db.generatedDocument.create({
      data: {
        organizationId: ctx.organizationId,
        type: up(input.type),
        title: input.title?.trim() || DEFAULT_TITLES[input.type],
        language: input.language,
        templateId: rendered.templateId ?? undefined,
        templateVersion: rendered.templateVersion ?? undefined,
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        dealId: input.dealId,
        variables: rendered.variables,
        content: rendered.content,
        createdById: ctx.userId,
      },
      include: rowInclude,
    });
    // A contract (a legal agreement, not a quotation/invoice/receipt/report/form) gets its own named audit
    // action, matching the security section's explicit "Contract generated" — the other 5 types still log
    // as document.created.
    const isContract = input.type === "purchase_agreement" || input.type === "sales_agreement" || input.type === "customer_agreement";
    await recordAudit(db, ctx, {
      action: isContract ? "contract.generated" : "document.created",
      entityType: "generated_document",
      entityId: row.id,
      metadata: { type: input.type },
      ...meta,
    });
    return toDetailDto(row);
  });
}

export async function updateDocument(
  ctx: AuthContext,
  id: string,
  patch: UpdateDocumentInput,
  meta?: RequestMeta
): Promise<DocumentDetailDto> {
  const scope = requirePermission(ctx, "documents", "update");
  return withTenant(ctx, async (db) => {
    const existing = await db.generatedDocument.findFirst({ where: { id } });
    if (!existing || !scopeAllows(ctx, scope, { ownerField: "createdById" }, existing)) throw notFound("Document not found.");

    const nextVehicleId = "vehicleId" in patch ? patch.vehicleId : existing.vehicleId;
    const nextCustomerId = "customerId" in patch ? patch.customerId : existing.customerId;
    const nextDealId = "dealId" in patch ? patch.dealId : existing.dealId;
    const relinked = "vehicleId" in patch || "customerId" in patch || "dealId" in patch;

    let content = existing.content;
    let variables = existing.variables as Prisma.InputJsonValue;
    let templateId = existing.templateId;
    let templateVersion = existing.templateVersion;
    if (relinked) {
      const rendered = await renderDocument(db, {
        type: down(existing.type) as (typeof documentTypeValues)[number],
        language: existing.language,
        vehicleId: nextVehicleId ?? undefined,
        customerId: nextCustomerId ?? undefined,
        dealId: nextDealId ?? undefined,
      });
      content = rendered.content;
      variables = rendered.variables as Prisma.InputJsonValue;
      templateId = rendered.templateId;
      templateVersion = rendered.templateVersion;
    }

    const row = await db.generatedDocument.update({
      where: { id },
      data: {
        title: patch.title?.trim() || existing.title,
        vehicleId: nextVehicleId,
        customerId: nextCustomerId,
        dealId: nextDealId,
        content,
        variables,
        templateId,
        templateVersion,
      },
      include: rowInclude,
    });
    await recordAudit(db, ctx, {
      action: "document.updated",
      entityType: "generated_document",
      entityId: id,
      metadata: { regenerated: relinked },
      ...meta,
    });
    return toDetailDto(row);
  });
}

export async function updateDocumentStatus(
  ctx: AuthContext,
  id: string,
  body: z.infer<typeof updateDocumentStatusSchema>,
  meta?: RequestMeta
): Promise<DocumentDetailDto> {
  const scope = requirePermission(ctx, "documents", "update");
  return withTenant(ctx, async (db) => {
    const existing = await db.generatedDocument.findFirst({ where: { id } });
    if (!existing || !scopeAllows(ctx, scope, { ownerField: "createdById" }, existing)) throw notFound("Document not found.");
    const row = await db.generatedDocument.update({
      where: { id },
      data: {
        status: up(body.status),
        signedAt: body.status === "signed" ? new Date() : existing.signedAt,
      },
      include: rowInclude,
    });
    await recordAudit(db, ctx, {
      action: "document.status_changed",
      entityType: "generated_document",
      entityId: id,
      metadata: { from: down(existing.status), to: body.status },
      ...meta,
    });
    return toDetailDto(row);
  });
}

export async function shareDocument(ctx: AuthContext, id: string, meta?: RequestMeta): Promise<{ url: string; expiresAt: string }> {
  const scope = requirePermission(ctx, "documents", "update");
  return withTenant(ctx, async (db) => {
    const existing = await db.generatedDocument.findFirst({ where: { id } });
    if (!existing || !scopeAllows(ctx, scope, { ownerField: "createdById" }, existing)) throw notFound("Document not found.");
    const shareToken = randomBytes(24).toString("base64url");
    const shareExpiresAt = new Date(Date.now() + SHARE_TTL_MS);
    await db.generatedDocument.update({ where: { id }, data: { shareToken, shareExpiresAt } });
    await recordAudit(db, ctx, { action: "document.shared", entityType: "generated_document", entityId: id, ...meta });
    return { url: `${appUrl()}/shared-documents/${shareToken}`, expiresAt: shareExpiresAt.toISOString() };
  });
}

// ── Templates ────────────────────────────────────────────────────────────────────────────────────────────

export interface TemplateDto {
  id: string;
  type: string;
  language: string;
  version: number;
  isActive: boolean;
  name: string;
  content: string;
  variables: string[];
  createdByName: string | null;
  createdAt: string;
}

export async function listTemplates(ctx: AuthContext, query: URLSearchParams): Promise<TemplateDto[]> {
  requirePermission(ctx, "documents", "read");
  const q = parseQuery(listTemplatesQuerySchema, query);
  return withTenant(ctx, async (db) => {
    const rows = await db.documentTemplate.findMany({
      where: q.type ? { type: up(q.type) } : {},
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ type: "asc" }, { language: "asc" }, { version: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      type: down(r.type),
      language: r.language,
      version: r.version,
      isActive: r.isActive,
      name: r.name,
      content: r.content,
      variables: r.variables as string[],
      createdByName: r.createdBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function createTemplate(
  ctx: AuthContext,
  input: z.infer<typeof createTemplateSchema>,
  meta?: RequestMeta
): Promise<TemplateDto> {
  // A template shapes every future document of that type for the WHOLE organization, so authoring one needs
  // more than the "own" scope a salesperson's documents:create carries (that only ever lets them generate
  // their own documents) — the same organization-wide-only distinction settings-like actions make elsewhere.
  const scope = requirePermission(ctx, "documents", "create");
  if (scope !== "organization") throw forbidden("Only an organization-wide role may create or edit document templates.");
  return withTenant(ctx, async (db) => {
    const type = up(input.type);
    const last = await db.documentTemplate.findFirst({ where: { type, language: input.language }, orderBy: { version: "desc" } });
    const version = (last?.version ?? 0) + 1;
    if (input.activate) {
      await db.documentTemplate.updateMany({ where: { type, language: input.language, isActive: true }, data: { isActive: false } });
    }
    const row = await db.documentTemplate.create({
      data: {
        organizationId: ctx.organizationId,
        type,
        language: input.language,
        version,
        isActive: input.activate,
        name: input.name,
        content: input.content,
        variables: extractVariables(input.content),
        createdById: ctx.userId,
      },
      include: { createdBy: { select: { name: true } } },
    });
    await recordAudit(db, ctx, {
      action: "document_template.created",
      entityType: "document_template",
      entityId: row.id,
      metadata: { type: input.type, language: input.language, version, activated: input.activate },
      ...meta,
    });
    return {
      id: row.id,
      type: down(row.type),
      language: row.language,
      version: row.version,
      isActive: row.isActive,
      name: row.name,
      content: row.content,
      variables: row.variables as string[],
      createdByName: row.createdBy?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
