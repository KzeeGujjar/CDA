import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  calculateProfitSchema,
  calculateProfitForRequest,
  getVehicleProfit,
  vehicleProfitSchema,
} from "@/server/modules/profit/profit.service";
import { createTask, createTaskSchema } from "@/server/modules/tasks/tasks.service";
import {
  bankEvaluationSchema,
  companyQuotationSchema,
  requestBankEvaluation,
  requestCompanyQuotation,
} from "@/server/modules/partner-requests/partner-requests.service";
import { uaeBanks } from "@/lib/uae-banks";
import { amountSchema, costsSchema, sellingExpensesSchema, vatSchema } from "@/lib/profit/schema";
import { defineTool } from "../types";

/** calculateProfit: with a vehicleId it uses that vehicle's stored costs; without one it uses the numbers given. */
const profitArgs = z.strictObject({
  vehicleId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional()
    .describe("A vehicle in the inventory: its stored purchase, repair and transport costs are used."),
  sellingPrice: amountSchema
    .optional()
    .describe("Agreed or target price. Defaults to the vehicle's expected selling price. Required without vehicleId."),
  vat: vatSchema.optional(),
  costs: costsSchema.optional().describe("Without vehicleId: purchasePrice is required."),
  additionalCosts: costsSchema
    .partial()
    .optional()
    .describe("With vehicleId: extra planned costs added to the stored ones."),
  sellingExpenses: sellingExpensesSchema.optional(),
});

export const calculateProfitTool = defineTool({
  name: "calculateProfit",
  description:
    "Calculate total cost, gross profit, net profit, profit %, ROI and break-even price for a sale, exactly (no rounding drift). Give vehicleId to use that vehicle's stored costs, or give the costs and sellingPrice yourself. Profit % is net profit divided by revenue; ROI is net profit divided by all money put in.",
  schema: profitArgs,
  requires: [["profit", "read"]],
  confirm: false,
  needsDb: false,
  activity: "PRICE_ANALYSIS",
  summarize: (r) => `Profit calculated (net ${(r as { netProfit: number }).netProfit})`,
  async execute(ctx, _db, a) {
    const { vehicleId, costs, additionalCosts, ...rest } = a;
    // The existing services validate strictly and check permissions, so the agent gets exactly the API's rules.
    // (Strict schemas reject even an explicit `undefined` key, so unused fields are left out, not blanked.)
    if (vehicleId) {
      if (costs)
        throw new AppError(
          400,
          "validation_error",
          "With vehicleId give additionalCosts, not costs: the stored costs are used."
        );
      return getVehicleProfit(
        ctx,
        vehicleId,
        vehicleProfitSchema.parse({ ...rest, ...(additionalCosts && { additionalCosts }) })
      );
    }
    if (additionalCosts)
      throw new AppError(400, "validation_error", "Without vehicleId give costs, not additionalCosts.");
    return calculateProfitForRequest(ctx, calculateProfitSchema.parse({ ...rest, ...(costs && { costs }) }));
  },
});

export const requestBankFinancingEvaluation = defineTool({
  name: "requestBankFinancingEvaluation",
  description: `Ask a UAE bank to evaluate a vehicle for financing (fee AED 300). This CHANGES something, so it is only a PROPOSAL: the user must approve it before anything is sent. Banks: ${uaeBanks.map((b) => `${b.code} (${b.shortName})`).join(", ")}. Give vehicleSource "inventory" with vehicleId, or "customer_owned" with customerVehicle details.`,
  schema: bankEvaluationSchema,
  requires: [["valuations", "create"]],
  confirm: true,
  needsDb: false,
  describe: (a) =>
    `Request a financing evaluation from ${uaeBanks.find((b) => b.code === a.bankCode)?.name ?? a.bankCode} for ${a.vehicleSource === "inventory" ? "an inventory vehicle" : `${a.customerVehicle?.year} ${a.customerVehicle?.make} ${a.customerVehicle?.model}`}, finance amount ${a.financeAmount} (fee AED 300)`,
  summarize: () => "Bank financing evaluation requested",
  execute: (ctx, _db, a) => requestBankEvaluation(ctx, a, { via: "ai_agent" }),
});

export const requestCompanyQuotationTool = defineTool({
  name: "requestCompanyQuotation",
  description:
    'Ask a company for a quotation for a vehicle. This CHANGES something, so it is only a PROPOSAL: the user must approve it before anything is sent. Give vehicleSource "inventory" with vehicleId, or "customer_owned" with customerVehicle details.',
  schema: companyQuotationSchema,
  requires: [["deals", "create"]],
  confirm: true,
  needsDb: false,
  describe: (a) =>
    `Request a company quotation for ${a.vehicleSource === "inventory" ? "an inventory vehicle" : `${a.customerVehicle?.year} ${a.customerVehicle?.make} ${a.customerVehicle?.model}`}${a.notes ? ` (${a.notes.slice(0, 80)})` : ""}`,
  summarize: () => "Company quotation requested",
  execute: (ctx, _db, a) => requestCompanyQuotation(ctx, a, { via: "ai_agent" }),
});

export const createTaskTool = defineTool({
  name: "createTask",
  description:
    "Create a task (a to-do) for a member of staff, optionally about one vehicle, customer, lead or deal. This CHANGES something, so it is only a PROPOSAL: the user must approve it before the task exists. dueAt is an ISO 8601 date-time with a time zone offset. By default the task is assigned to the current user.",
  schema: createTaskSchema,
  requires: [["tasks", "create"]],
  confirm: true,
  needsDb: false,
  describe: (a) => `Create task "${a.title}" (${a.category.replace("_", " ")}, ${a.priority} priority), due ${a.dueAt}`,
  summarize: () => "Task created",
  async execute(ctx, _db, a) {
    const task = await createTask(ctx, a, { source: "ai_agent" });
    if (!task) throw new AppError(500, "internal_error", "The task could not be created.");
    return task;
  },
});
