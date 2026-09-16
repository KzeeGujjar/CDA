import type { LucideIcon } from "lucide-react";
import { Camera, ClipboardCheck, FileUp, Phone, Send, Truck, Users, Wrench } from "lucide-react";
import type { TaskCategory } from "@/types/task";

export const taskCategoryMeta: Record<TaskCategory, { icon: LucideIcon; labelKey: string }> = {
  follow_up: { icon: Users, labelKey: "followUp" },
  inspection: { icon: ClipboardCheck, labelKey: "inspection" },
  photography: { icon: Camera, labelKey: "photography" },
  documents: { icon: FileUp, labelKey: "documents" },
  call: { icon: Phone, labelKey: "call" },
  quotation: { icon: Send, labelKey: "quotation" },
  service: { icon: Wrench, labelKey: "service" },
  delivery: { icon: Truck, labelKey: "delivery" },
};

export const taskCategories: TaskCategory[] = [
  "follow_up",
  "inspection",
  "photography",
  "documents",
  "call",
  "quotation",
  "service",
  "delivery",
];
