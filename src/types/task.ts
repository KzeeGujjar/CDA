import type { ID } from "./common";

export type TaskCategory =
  | "follow_up"
  | "inspection"
  | "photography"
  | "documents"
  | "call"
  | "quotation"
  | "service"
  | "delivery";

export type TaskStatus = "open" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface DealershipTask {
  id: ID;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string;
  assignedToName: string;
  vehicleId?: ID;
  vehicleLabel?: string;
  customerId?: ID;
  customerName?: string;
  createdAt: string;
  completedAt?: string;
}

export type TaskInput = Pick<
  DealershipTask,
  "title" | "category" | "priority" | "dueAt" | "assignedToName" | "vehicleId" | "vehicleLabel" | "customerId" | "customerName"
>;
