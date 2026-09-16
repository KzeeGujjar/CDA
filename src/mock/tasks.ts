import type { DealershipTask } from "@/types/task";
import { customersFixture } from "./customers";
import { vehiclesFixture } from "./vehicles";
import { salespeople } from "@/lib/salespeople";

function link(customerId?: string, vehicleId?: string) {
  const c = customerId ? customersFixture.find((x) => x.id === customerId) : undefined;
  const v = vehicleId ? vehiclesFixture.find((x) => x.id === vehicleId) : undefined;
  return {
    customerId: c?.id,
    customerName: c?.name,
    vehicleId: v?.id,
    vehicleLabel: v ? `${v.year} ${v.make} ${v.model} ${v.trim}` : undefined,
  };
}

export const tasksFixture: DealershipTask[] = [
  // Overdue
  {
    id: "task-001", title: "Follow up with Rajesh Kumar about financing", category: "follow_up", status: "open", priority: "high",
    dueAt: "2026-09-12T10:00:00Z", assignedToName: salespeople[2], ...link("cus-003"), createdAt: "2026-09-09",
  },
  {
    id: "task-002", title: "Call Khalid Al Nuaimi re: fleet order", category: "call", status: "open", priority: "high",
    dueAt: "2026-09-13T09:00:00Z", assignedToName: salespeople[3], ...link("cus-008"), createdAt: "2026-09-10",
  },
  {
    id: "task-003", title: "Inspect F-150 Raptor before listing", category: "inspection", status: "open", priority: "medium",
    dueAt: "2026-09-14T12:00:00Z", assignedToName: salespeople[3], ...link(undefined, "veh-008"), createdAt: "2026-09-11",
  },
  // Today
  {
    id: "task-004", title: "Photograph Porsche Cayenne Turbo GT", category: "photography", status: "open", priority: "medium",
    dueAt: "2026-09-15T10:00:00Z", assignedToName: salespeople[1], ...link(undefined, "veh-016"), createdAt: "2026-09-13",
  },
  {
    id: "task-005", title: "Send quotation to Elena Petrova", category: "quotation", status: "open", priority: "high",
    dueAt: "2026-09-15T14:00:00Z", assignedToName: salespeople[2], ...link("cus-007", "veh-013"), createdAt: "2026-09-13",
  },
  {
    id: "task-006", title: "Call Priya Nair about Palisade availability", category: "call", status: "open", priority: "low",
    dueAt: "2026-09-15T16:00:00Z", assignedToName: salespeople[0], ...link("cus-009", "veh-012"), createdAt: "2026-09-13",
  },
  // Upcoming
  {
    id: "task-007", title: "Prepare Jeep Wrangler 4xe for delivery", category: "delivery", status: "open", priority: "high",
    dueAt: "2026-09-16T11:00:00Z", assignedToName: salespeople[1], ...link("cus-014", "veh-020"), createdAt: "2026-09-11",
  },
  {
    id: "task-008", title: "Upload Fatima Al Suwaidi's ID documents", category: "documents", status: "open", priority: "low",
    dueAt: "2026-09-17T09:00:00Z", assignedToName: salespeople[1], ...link("cus-002"), createdAt: "2026-09-12",
  },
  {
    id: "task-009", title: "Schedule service for Bentayga EWB", category: "service", status: "open", priority: "medium",
    dueAt: "2026-09-18T13:00:00Z", assignedToName: salespeople[1], ...link("cus-006", "veh-017"), createdAt: "2026-09-12",
  },
  {
    id: "task-010", title: "Follow up with Omar Al Falasi on trade-in offer", category: "follow_up", status: "open", priority: "high",
    dueAt: "2026-09-19T10:00:00Z", assignedToName: salespeople[1], ...link("cus-006", "veh-017"), createdAt: "2026-09-13",
  },
  {
    id: "task-011", title: "Inspect new Audi Q8 arrival", category: "inspection", status: "open", priority: "medium",
    dueAt: "2026-09-20T09:00:00Z", assignedToName: salespeople[2], ...link(undefined, "veh-009"), createdAt: "2026-09-14",
  },
  // Completed
  {
    id: "task-012", title: "Photograph Land Cruiser GXR", category: "photography", status: "completed", priority: "medium",
    dueAt: "2026-09-01T10:00:00Z", assignedToName: salespeople[0], ...link(undefined, "veh-001"), createdAt: "2026-08-28",
    completedAt: "2026-09-01T09:40:00Z",
  },
  {
    id: "task-013", title: "Send quotation to Ahmed Al Mazrouei", category: "quotation", status: "completed", priority: "high",
    dueAt: "2026-09-10T14:00:00Z", assignedToName: salespeople[0], ...link("cus-001", "veh-003"), createdAt: "2026-09-08",
    completedAt: "2026-09-10T13:20:00Z",
  },
  {
    id: "task-014", title: "Deliver LX 600 to Muhammad Bilal", category: "delivery", status: "completed", priority: "high",
    dueAt: "2026-09-02T11:00:00Z", assignedToName: salespeople[0], ...link("cus-005", "veh-011"), createdAt: "2026-08-30",
    completedAt: "2026-09-02T11:15:00Z",
  },
  {
    id: "task-015", title: "Call Hassan Raza about Yukon offer", category: "call", status: "completed", priority: "low",
    dueAt: "2026-08-29T12:00:00Z", assignedToName: salespeople[1], ...link("cus-010", "veh-018"), createdAt: "2026-08-27",
    completedAt: "2026-08-29T12:30:00Z",
  },
];
