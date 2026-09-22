import { z } from "zod";
import { MAX_DAYS, ProfitInputError, toBasisPoints, toMinor } from "./money";

/**
 * Request/form shape for the profit calculator. Strict objects: an unknown key is an error, so a client
 * cannot smuggle extra fields (or an organization id) into a calculation. Amount and percentage rules are
 * the same functions the calculator itself uses, so a value that passes here cannot fail there.
 */
const numberOrString = z.union([z.number(), z.string()]);

const checked = (parse: (value: unknown, path: string) => unknown) =>
  numberOrString.superRefine((value, ctx) => {
    try {
      parse(value, "");
    } catch (error) {
      if (error instanceof ProfitInputError) ctx.addIssue({ code: "custom", message: error.issues[0].message });
      else throw error;
    }
  });

export const amountSchema = checked(toMinor);
export const percentSchema = checked(toBasisPoints);

export const vatSchema = z.strictObject({ included: z.boolean(), ratePercent: percentSchema });

export const costsSchema = z.strictObject({
  purchasePrice: amountSchema,
  importDuty: amountSchema.optional(),
  transport: amountSchema.optional(),
  inspection: amountSchema.optional(),
  repair: amountSchema.optional(),
  registration: amountSchema.optional(),
  other: amountSchema.optional(),
});

export const sellingExpensesSchema = z.strictObject({
  commissionPercent: percentSchema.optional(),
  commission: amountSchema.optional(),
  marketing: amountSchema.optional(),
  warranty: amountSchema.optional(),
  other: amountSchema.optional(),
  holding: z
    .strictObject({
      days: z.number().int().min(0).max(MAX_DAYS),
      annualRatePercent: percentSchema.optional(),
      dailyOverhead: amountSchema.optional(),
    })
    .optional(),
});

export const profitInputSchema = z.strictObject({
  sellingPrice: amountSchema,
  vat: vatSchema.optional(),
  costs: costsSchema,
  sellingExpenses: sellingExpensesSchema.optional(),
});
export type ProfitInputBody = z.infer<typeof profitInputSchema>;
