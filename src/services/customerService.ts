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
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

/**
 * Customers. `getCustomers` / `getCustomerById` are connected to /api/v1/customers: with a real session the list
 * (and lifetimeValue) comes from the database, scoped to what the signed-in role may see. Without one, the
 * built-in demo data is used, as before.
 *
 * Notes, tasks, documents, messages and calls have no backend yet (§0.12), so those stay demo-only; the
 * customer detail page's panels for them keep working exactly as before rather than going blank.
 */
const customers: Customer[] = [...customersFixture];
let notes: CustomerNote[] = [...customerNotesFixture];
let tasks: CustomerTask[] = [...customerTasksFixture];
const documents: CustomerDocument[] = [...customerDocumentsFixture];
let messages: CustomerMessage[] = [...customerMessagesFixture];
const calls: CustomerCall[] = [...customerCallsFixture];

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

async function demoGetCustomers(filters?: CustomerFilters): Promise<Customer[]> {
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

async function demoGetCustomerById(id: ID): Promise<Customer | null> {
  await wait(150);
  return customers.find((c) => c.id === id) ?? null;
}

// ─────────────────────────────────────────── live ───────────────────────────────────────────

interface CustomerDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifetimeValue: number | null;
  createdAt: string;
}
interface CustomerListDto {
  items: CustomerDto[];
  total: number;
}

/**
 * Fields the live API does not hold yet (tags, nationality, preferred language, address, avatar) come through as
 * "" / [] / undefined rather than invented — the UI already treats an empty tag list and an unset avatar as normal.
 */
function toCustomer(d: CustomerDto): Customer {
  return {
    id: d.id,
    name: d.name,
    email: d.email ?? "",
    phone: d.phone ?? "",
    tags: [],
    createdAt: d.createdAt,
    lifetimeValue: d.lifetimeValue ?? undefined,
  };
}

async function liveGetCustomers(filters?: CustomerFilters): Promise<Customer[]> {
  const q = new URLSearchParams();
  if (filters?.search) q.set("search", filters.search);
  const items: Customer[] = [];
  const pageSize = 100;
  for (let page = 1; page <= 20; page++) {
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    const dto = unwrapBackend(await backendRequest<CustomerListDto>("GET", `/customers?${q.toString()}`));
    items.push(...dto.items.map(toCustomer));
    if (items.length >= dto.total || dto.items.length === 0) break;
  }
  // The tag filter has no backend column yet: apply it client-side so the page keeps working (§0.12).
  return filters?.tag ? items.filter((c) => c.tags.includes(filters.tag!)) : items;
}

async function liveGetCustomerById(id: ID): Promise<Customer | null> {
  const result = await backendRequest<CustomerDto>("GET", `/customers/${id}`);
  if (result.kind === "error" && result.error.status === 404) return null;
  return toCustomer(unwrapBackend(result));
}

// ─────────────────────────────────────────── exported ───────────────────────────────────────────

export function getCustomers(filters?: CustomerFilters): Promise<Customer[]> {
  return liveOrDemo({ live: () => liveGetCustomers(filters), demo: () => demoGetCustomers(filters) });
}

export function getCustomerById(id: ID): Promise<Customer | null> {
  return liveOrDemo({ live: () => liveGetCustomerById(id), demo: () => demoGetCustomerById(id) });
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
