import { z } from "zod";

export const leadNoteSchema = z.object({
  summary: z.string().min(3, "Note is required"),
});

export type LeadNoteValues = z.infer<typeof leadNoteSchema>;

export const leadCreateSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  interestedVehicleId: z.string().optional(),
  budgetAmount: z.coerce.number().min(0).optional(),
  source: z.enum(["website", "walk_in", "referral", "social_media", "marketplace", "phone"]),
  assignedToName: z.string().min(1, "Select a salesperson"),
});

export type LeadCreateValues = z.infer<typeof leadCreateSchema>;
