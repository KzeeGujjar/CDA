import type { ID } from "@/types/common";
import type { DealershipTask, TaskInput, TaskStatus } from "@/types/task";
import { tasksFixture } from "@/mock/tasks";

let tasks: DealershipTask[] = [...tasksFixture];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getTasks(): Promise<DealershipTask[]> {
  await wait();
  return tasks;
}

export async function createTask(input: TaskInput): Promise<DealershipTask> {
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

export async function updateTaskStatus(id: ID, status: TaskStatus): Promise<DealershipTask> {
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
