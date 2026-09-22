import { z } from "zod";
import type { PartnerRequest } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission, scopeAllows } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { AppError, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { BANK_EVALUATION_FEE_AED, uaeBanks } from "@/lib/uae-banks";
import { addAmounts } from "@/lib/profit/money";
import { amountSchema } from "@/lib/profit/schema";

/**
 * Requests to partners, mirroring the frontend BankEvaluationRequest / QuotationRequest: a bank asked to
 * evaluate a vehicle for financing, or a company asked to quote for a vehicle. Created by the AI agent only
 * AFTER a person approves the proposal, and always with the approving person's permissions.
 */
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "is not a valid id");

const customerVehicleSchema = z.strictObject({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  variant: z.string().trim().max(80).optional(),
  year: z.number().int().min(1900).max(2100),
  mileageKm: z.number().int().min(0).max(2_000_000),
  condition: z.enum(["new", "used", "certified_pre_owned"]),
  specifications: z.string().trim().max(500).optional(),
});

const requestBase = {
  vehicleSource: z.enum(["inventory", "customer_owned"]),
  vehicleId: idSchema.optional(),
  customerVehicle: customerVehicleSchema.optional(),
  customerId: idSchema.optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
};

/** An inventory vehicle needs vehicleId; a customer-owned one needs its details; never both. */
const sourceRule = (v: { vehicleSource: string; vehicleId?: string; customerVehicle?: unknown }) =>
  v.vehicleSource === "inventory" ? !!v.vehicleId && !v.customerVehicle : !v.vehicleId && !!v.customerVehicle;
const sourceMessage = {
  message: "Give vehicleId for an inventory vehicle, or customerVehicle for a customer-owned one (not both).",
};

const bankCodes = uaeBanks.map((b) => b.code) as [string, ...string[]];
export const bankEvaluationSchema = z
  .strictObject({ ...requestBase, bankCode: z.enum(bankCodes), financeAmount: amountSchema })
  .refine(sourceRule, sourceMessage);
export const companyQuotationSchema = z.strictObject(requestBase).refine(sourceRule, sourceMessage);

export type BankEvaluationInput = z.infer<typeof bankEvaluationSchema>;
export type CompanyQuotationInput = z.infer<typeof companyQuotationSchema>;

export interface PartnerRequestDto {
  id: string;
  kind: "bank_evaluation" | "company_quotation";
  status: string;
  vehicleSource: string;
  vehicleId: string | null;
  vehicleLabel: string;
  customerName: string | null;
  bankCode?: string;
  bankName?: string;
  financeAmount?: number;
  fee?: { amount: number; currency: string };
  notes: string | null;
  requestedAt: string;
}

const toDto = (r: PartnerRequest): PartnerRequestDto => ({
  id: r.id,
  kind: r.kind === "BANK_EVALUATION" ? "bank_evaluation" : "company_quotation",
  status: r.status.toLowerCase(),
  vehicleSource: r.vehicleSource.toLowerCase(),
  vehicleId: r.vehicleId,
  vehicleLabel: r.vehicleLabel,
  customerName: r.customerName,
  ...(r.bankCode ? { bankCode: r.bankCode, bankName: uaeBanks.find((b) => b.code === r.bankCode)?.name } : {}),
  ...(r.financeAmount ? { financeAmount: Number(r.financeAmount) } : {}),
  ...(r.fee ? { fee: { amount: Number(r.fee), currency: r.feeCurrency ?? "AED" } } : {}),
  notes: r.notes,
  requestedAt: r.requestedAt.toISOString(),
});

async function create(
  ctx: AuthContext,
  input: BankEvaluationInput | CompanyQuotationInput,
  kind: "BANK_EVALUATION" | "COMPANY_QUOTATION",
  options: { via?: "manual" | "ai_agent"; meta?: RequestMeta }
): Promise<PartnerRequestDto> {
  const bank = "bankCode" in input ? input : null;
  return withTenant(ctx, async (db) => {
    let vehicleLabel: string;
    if (input.vehicleSource === "inventory") {
      const scope = requirePermission(ctx, "vehicles", "read");
      const v = await db.vehicle.findFirst({ where: { id: input.vehicleId } });
      if (!v || !scopeAllows(ctx, scope, { branchField: "branchId" }, v)) throw notFound("Vehicle not found.");
      vehicleLabel = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;
    } else {
      const cv = input.customerVehicle!;
      vehicleLabel = `${cv.year} ${cv.make} ${cv.model}${cv.variant ? ` ${cv.variant}` : ""}`;
    }
    let customerName = input.customerName ?? null;
    if (input.customerId) {
      const scope = requirePermission(ctx, "customers", "read");
      const c = await db.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
      if (!c || !scopeAllows(ctx, scope, {}, c)) throw notFound("Customer not found.");
      customerName = c.name;
    }
    let financeAmount: string | undefined;
    if (bank) {
      financeAmount = addAmounts(bank.financeAmount, 0, "financeAmount");
      if (!(Number(financeAmount) > 0))
        throw new AppError(400, "validation_error", "The finance amount must be more than 0.");
    }
    const row = await db.partnerRequest.create({
      data: {
        organizationId: ctx.organizationId,
        kind,
        vehicleSource: input.vehicleSource === "inventory" ? "INVENTORY" : "CUSTOMER_OWNED",
        vehicleId: input.vehicleId,
        customerVehicle: input.customerVehicle ?? undefined,
        vehicleLabel,
        customerId: input.customerId,
        customerName,
        ...(bank ? { bankCode: bank.bankCode, financeAmount, fee: BANK_EVALUATION_FEE_AED, feeCurrency: "AED" } : {}),
        notes: input.notes,
        requestedById: ctx.userId,
        requestedVia: options.via ?? "manual",
      },
    });
    await recordAudit(db, ctx, {
      action: kind === "BANK_EVALUATION" ? "bank_evaluation.requested" : "company_quotation.requested",
      entityType: "partner_request",
      entityId: row.id,
      metadata: { via: options.via ?? "manual", vehicleSource: input.vehicleSource },
      ...options.meta,
    });
    return toDto(row);
  });
}

/** A bank is asked to evaluate a vehicle for financing (fee AED 300, as in the frontend). Needs valuations:create. */
export function requestBankEvaluation(
  ctx: AuthContext,
  input: BankEvaluationInput,
  options: { via?: "manual" | "ai_agent"; meta?: RequestMeta } = {}
) {
  requirePermission(ctx, "valuations", "create");
  return create(ctx, input, "BANK_EVALUATION", options);
}

/** A company is asked to quote for a vehicle. Quotations belong to deals, so this needs deals:create. */
export function requestCompanyQuotation(
  ctx: AuthContext,
  input: CompanyQuotationInput,
  options: { via?: "manual" | "ai_agent"; meta?: RequestMeta } = {}
) {
  requirePermission(ctx, "deals", "create");
  return create(ctx, input, "COMPANY_QUOTATION", options);
}
