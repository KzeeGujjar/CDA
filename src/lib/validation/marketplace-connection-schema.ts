import { z } from "zod";

export const marketplaceConnectionSchema = z.object({
  accountUrl: z.string().min(1, "Link is required").url("Enter a valid link"),
});

export type MarketplaceConnectionValues = z.infer<typeof marketplaceConnectionSchema>;
