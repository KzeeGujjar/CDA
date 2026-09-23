import type { ID } from "@/types/common";
import type { DealershipTask, TaskInput, TaskStatus } from "@/types/task";
import { tasksFixture } from "@/mock/tasks";
import { salespeople } from "@/lib/salespeople";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

let tasks: DealershipTask[] = [...tasksFixture];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

interface TaskListDto {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  dueAt: string;
  assignedToId: string | null;
  assignedToName: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  dealId: string | null;
  dealReference: string | null;
  remindAt: string | null;
  createdAt: string;
  completedAt: string | null;
}
interface CreateTaskDto {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  dueAt: string;
  assignedToId: string | null;
  assignedToName: string | null;
  createdAt: string;
}

function toDealershipTask(d: TaskListDto): DealershipTask {
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? undefined,
    category: d.category as DealershipTask["category"],
    status: d.status as TaskStatus,
    priority: d.priority as DealershipTask["priority"],
    dueAt: d.dueAt,
    assignedToId: d.assignedToId ?? undefined,
    assignedToName: d.assignedToName ?? "—",
    vehicleId: d.vehicleId ?? undefined,
    vehicleLabel: d.vehicleLabel ?? undefined,
    customerId: d.customerId ?? undefined,
    customerName: d.customerName ?? undefined,
    dealId: d.dealId ?? undefined,
    dealReference: d.dealReference ?? undefined,
    remindAt: d.remindAt ?? undefined,
    createdAt: d.createdAt,
    completedAt: d.completedAt ?? undefined,
  };
}

// ── Tasks ────────────────────────────────────────────────────────────────────────────────────────────────

async function demoGetTasks(): Promise<DealershipTask[]> {
  await wait();
  return tasks;
}

async function liveGetTasks(): Promise<DealershipTask[]> {
  const items = unwrapBackend(await backendRequest<TaskListDto[]>("GET", "/tasks"));
  return items.map(toDealershipTask);
}

export function getTasks(): Promise<DealershipTask[]> {
  return liveOrDemo({ live: liveGetTasks, demo: demoGetTasks });
}

async function demoCreateTask(input: TaskInput): Promise<DealershipTask> {
  await wait();
  const task: DealershipTask = {
    ...input,
    id: `task-${Math.random().toString(36).slice(2, 9)}`,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  tasks = [task, ...tasks];
  return task;
}

async function liveCreateTask(input: TaskInput): Promise<DealershipTask> {
  // The list this feeds is refetched right after (see components/tasks/new-task-dialog.tsx's onSuccess), so
  // vehicleLabel/customerName here are just what the form already knew — the refetch brings the real ones.
  const data = unwrapBackend(
    await backendRequest<CreateTaskDto>("POST", "/tasks", {
      title: input.title,
      category: input.category,
      priority: input.priority,
      dueAt: input.dueAt,
      ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
      ...(input.vehicleId
        ? { context: { type: "vehicle", id: input.vehicleId } }
        : input.customerId
          ? { context: { type: "customer", id: input.customerId } }
          : {}),
    })
  );
  return {
    id: data.id,
    title: data.title,
    description: data.description ?? undefined,
    category: data.category as DealershipTask["category"],
    status: data.status as TaskStatus,
    priority: data.priority as DealershipTask["priority"],
    dueAt: data.dueAt,
    assignedToId: data.assignedToId ?? undefined,
    assignedToName: data.assignedToName ?? input.assignedToName,
    vehicleId: input.vehicleId,
    vehicleLabel: input.vehicleLabel,
    customerId: input.customerId,
    customerName: input.customerName,
    createdAt: data.createdAt,
  };
}

export function createTask(input: TaskInput): Promise<DealershipTask> {
  return liveOrDemo({ live: () => liveCreateTask(input), demo: () => demoCreateTask(input) });
}

async function demoUpdateTaskStatus(id: ID, status: TaskStatus): Promise<DealershipTask> {
  await wait();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) throw new Error("Task not found");
  tasks[index] = {
    ...tasks[index],
    status,
    completedAt: status === "completed" ? new Date().toISOString() : undefined,
  };
  return tasks[index];
}

async function liveUpdateTaskStatus(id: ID, status: TaskStatus): Promise<DealershipTask> {
  const data = unwrapBackend(await backendRequest<TaskListDto>("PATCH", `/tasks/${id}/status`, { status }));
  return toDealershipTask(data);
}

export function updateTaskStatus(id: ID, status: TaskStatus): Promise<DealershipTask> {
  return liveOrDemo({ live: () => liveUpdateTaskStatus(id, status), demo: () => demoUpdateTaskStatus(id, status) });
}

// ── Assignable users, for the New Task dialog's assignee picker ────────────────────────────────────────────

export interface AssignableUser {
  id: string;
  name: string;
}

async function liveGetAssignableUsers(): Promise<AssignableUser[]> {
  const rows = unwrapBackend(await backendRequest<{ id: string; name: string }[]>("GET", "/users"));
  return rows.map((u) => ({ id: u.id, name: u.name }));
}

/** Demo mode has no real user ids, so the name doubles as the id — harmless, since demo tasks are never
 * looked up by assignee id anywhere. */
export function getAssignableUsers(): Promise<AssignableUser[]> {
  return liveOrDemo({
    live: liveGetAssignableUsers,
    demo: async () => salespeople.map((name) => ({ id: name, name })),
  });
}
