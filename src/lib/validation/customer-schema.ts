import { z } from "zod";

export const customerNoteSchema = z.object({
  body: z.string().min(3, "Note is required"),
});

export type CustomerNoteValues = z.infer<typeof customerNoteSchema>;

export const customerTaskSchema = z.object({
  title: z.string().min(3, "Task title is required"),
  assignedToName: z.string().min(1, "Assignee is required"),
});

export type CustomerTaskValues = z.infer<typeof customerTaskSchema>;

export const customerMessageSchema = z.object({
  channel: z.enum(["whatsapp", "email", "sms"]),
  body: z.string().min(1, "Message is required"),
});

export type CustomerMessageValues = z.infer<typeof customerMessageSchema>;
