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
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string;
  assignedToId?: ID;
  assignedToName: string;
  vehicleId?: ID;
  vehicleLabel?: string;
  customerId?: ID;
  customerName?: string;
  dealId?: ID;
  dealReference?: string;
  /** When a reminder notification will be sent. Set by the backend; no UI creates one yet. */
  remindAt?: string;
  createdAt: string;
  completedAt?: string;
}

export type TaskInput = Pick<
  DealershipTask,
  "title" | "category" | "priority" | "dueAt" | "assignedToId" | "assignedToName" | "vehicleId" | "vehicleLabel" | "customerId" | "customerName"
>;
