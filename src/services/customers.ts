import type { ID } from "@/types/common";
import type {
  Customer,
  CustomerCall,
  CustomerDocument,
  CustomerFilters,
  CustomerMessage,
  CustomerNote,
  CustomerTask,
  CustomerTaskStatus,
} from "@/types/customer";
import { customersFixture } from "@/mock/customers";
import {
  customerCallsFixture,
  customerDocumentsFixture,
  customerMessagesFixture,
  customerNotesFixture,
  customerTasksFixture,
} from "@/mock/customer-activity";

const customers: Customer[] = [...customersFixture];
let notes: CustomerNote[] = [...customerNotesFixture];
let tasks: CustomerTask[] = [...customerTasksFixture];
const documents: CustomerDocument[] = [...customerDocumentsFixture];
let messages: CustomerMessage[] = [...customerMessagesFixture];
const calls: CustomerCall[] = [...customerCallsFixture];

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getCustomers(filters?: CustomerFilters): Promise<Customer[]> {
  await wait();
  return customers.filter((c) => {
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${c.name} ${c.email} ${c.phone}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters?.tag && !c.tags.includes(filters.tag)) return false;
    return true;
  });
}

export async function getCustomerById(id: ID): Promise<Customer | null> {
  await wait(150);
  return customers.find((c) => c.id === id) ?? null;
}

export async function getCustomerNotes(customerId: ID): Promise<CustomerNote[]> {
  await wait(200);
  return notes.filter((n) => n.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addCustomerNote(customerId: ID, body: string, authorName: string): Promise<CustomerNote> {
  await wait();
  const created: CustomerNote = {
    id: `note-${Math.random().toString(36).slice(2, 9)}`,
    customerId,
    body,
    authorName,
    createdAt: new Date().toISOString(),
  };
  notes = [created, ...notes];
  return created;
}

export async function getCustomerTasks(customerId: ID): Promise<CustomerTask[]> {
  await wait(200);
  return tasks.filter((t) => t.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createCustomerTask(
  customerId: ID,
  title: string,
  assignedToName: string,
  dueAt?: string
): Promise<CustomerTask> {
  await wait();
  const created: CustomerTask = {
    id: `ctask-${Math.random().toString(36).slice(2, 9)}`,
    customerId,
    title,
    status: "open",
    assignedToName,
    dueAt,
    createdAt: new Date().toISOString(),
  };
  tasks = [created, ...tasks];
  return created;
}

export async function updateCustomerTaskStatus(id: ID, status: CustomerTaskStatus): Promise<CustomerTask> {
  await wait();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) throw new Error("Task not found");
  tasks[index] = { ...tasks[index], status };
  return tasks[index];
}

export async function getCustomerDocuments(customerId: ID): Promise<CustomerDocument[]> {
  await wait(200);
  return documents.filter((d) => d.customerId === customerId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function getCustomerMessages(customerId: ID): Promise<CustomerMessage[]> {
  await wait(200);
  return messages.filter((m) => m.customerId === customerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addCustomerMessage(
  customerId: ID,
  channel: CustomerMessage["channel"],
  body: string
): Promise<CustomerMessage> {
  await wait();
  const created: CustomerMessage = {
    id: `cmsg-${Math.random().toString(36).slice(2, 9)}`,
    customerId,
    channel,
    direction: "outbound",
    body,
    createdAt: new Date().toISOString(),
  };
  messages = [...messages, created];
  return created;
}

export async function getCustomerCalls(customerId: ID): Promise<CustomerCall[]> {
  await wait(200);
  return calls.filter((c) => c.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
