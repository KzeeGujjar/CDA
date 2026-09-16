import { z } from "zod";

export const dealFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  notes: z.string().optional(),
});

export type DealFormValues = z.infer<typeof dealFormSchema>;
