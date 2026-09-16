import { z } from "zod";

export const dashboardAdSchema = z.object({
  title: z.string().min(3, "Title is required"),
  description: z.string().min(3, "Description is required"),
  ctaLabel: z.string().min(2, "Button label is required"),
  ctaUrl: z.string().min(1, "Link is required"),
  badge: z.string().optional(),
  active: z.boolean(),
});

export type DashboardAdValues = z.infer<typeof dashboardAdSchema>;
