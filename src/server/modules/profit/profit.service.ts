import { z } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission, scopeAllows } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { AppError, notFound } from "@/server/lib/errors";
import { calculateProfit, type ProfitInput, type ProfitResult } from "@/lib/profit/calculate";
import { addAmounts, ProfitInputError } from "@/lib/profit/money";
import { amountSchema, costsSchema, profitInputSchema, sellingExpensesSchema, vatSchema } from "@/lib/profit/schema";

/**
 * Profit endpoints. The arithmetic lives in @/lib/profit (pure, exact, shared with the browser); this
 * module adds what only the server can: who may calculate, and where a stored vehicle's costs come from.
 *
 *   calculateProfitForRequest  a what-if from numbers the caller supplies (profit:read). Nothing is stored
 *                              and no tenant data is read, so there is nothing to leak.
 *   getVehicleProfit           a stored vehicle: its purchase, repair, transport and other costs come from
 *                              the DATABASE (the client cannot override them), the client only supplies the
 *                              price and the selling-side assumptions (profit:read + vehicles:read, and the
 *                              vehicle must be inside the caller's scope).
 */

export const calculateProfitSchema = profitInputSchema;
export type CalculateProfitBody = z.infer<typeof calculateProfitSchema>;

/** Note what is NOT accepted: the stored costs. `additionalCosts` can only ADD planned costs on top of them. */
export const vehicleProfitSchema = z.strictObject({
  sellingPrice: amountSchema.optional(),
  vat: vatSchema.optional(),
  additionalCosts: costsSchema.partial().optional(),
  sellingExpenses: sellingExpensesSchema.optional(),
});
export type VehicleProfitBody = z.infer<typeof vehicleProfitSchema>;

/** Turns the calculator's validation error into the API's standard 400 with per-field messages. */
function run(input: ProfitInput): ProfitResult {
  try {
    return calculateProfit(input);
  } catch (error) {
    if (error instanceof ProfitInputError) {
      throw new AppError(400, "validation_error", "Invalid request.", {}, error.issues);
    }
    throw error;
  }
}

export function calculateProfitForRequest(ctx: AuthContext, body: CalculateProfitBody): ProfitResult {
  requirePermission(ctx, "profit", "read");
  return run(body);
}

export interface VehicleProfitDto extends ProfitResult {
  source: "vehicle";
  sellingPriceSource: "request" | "expectedSellingPrice" | "listPrice";
  vehicle: { id: string; stockNumber: string; make: string; model: string; year: number; status: string };
}

export async function getVehicleProfit(
  ctx: AuthContext,
  vehicleId: string,
  body: VehicleProfitBody
): Promise<VehicleProfitDto> {
  requirePermission(ctx, "profit", "read");
  const vehicleScope = requirePermission(ctx, "vehicles", "read");

  const vehicle = await withTenant(ctx, (db) => db.vehicle.findFirst({ where: { id: vehicleId } }));
  // Another organization's vehicle, or one outside the caller's branch scope, is simply "not found".
  if (!vehicle || !scopeAllows(ctx, vehicleScope, { branchField: "branchId" }, vehicle)) {
    throw notFound("Vehicle not found.");
  }

  const planned = body.additionalCosts ?? {};
  const stored = {
    purchasePrice: vehicle.purchasePrice.toFixed(2),
    repair: vehicle.repairCost.toFixed(2),
    transport: vehicle.transportCost.toFixed(2),
    other: vehicle.otherCost.toFixed(2),
  };
  // Stored cost + any planned extra, added exactly (never as floats).
  const plus = (key: keyof typeof stored) =>
    planned[key] === undefined ? stored[key] : addAmounts(stored[key], planned[key], `additionalCosts.${key}`);

  const price = body.sellingPrice ?? vehicle.expectedSellingPrice?.toFixed(2) ?? vehicle.listPrice.toFixed(2);
  const sellingPriceSource: VehicleProfitDto["sellingPriceSource"] =
    body.sellingPrice !== undefined ? "request" : vehicle.expectedSellingPrice ? "expectedSellingPrice" : "listPrice";

  const result = run({
    sellingPrice: price,
    vat: body.vat,
    costs: {
      purchasePrice: plus("purchasePrice"),
      repair: plus("repair"),
      transport: plus("transport"),
      other: plus("other"),
      importDuty: planned.importDuty,
      inspection: planned.inspection,
      registration: planned.registration,
    },
    sellingExpenses: body.sellingExpenses,
  });

  return {
    source: "vehicle",
    sellingPriceSource,
    vehicle: {
      id: vehicle.id,
      stockNumber: vehicle.stockNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      status: vehicle.status.toLowerCase(),
    },
    ...result,
  };
}
