import { vehiclesFixture } from "@/mock/vehicles";
import { customersFixture } from "@/mock/customers";
import { leadsFixture } from "@/mock/leads";
import { dealsFixture } from "@/mock/deals";
import { chatThreadsFixture } from "@/mock/ai-conversations";
import { conversationsFixture } from "@/mock/conversations";
import { documentsFixture } from "@/mock/documents";
import { tasksFixture } from "@/mock/tasks";
import { notificationsFixture } from "@/mock/notifications";

export interface DemoStat {
  key: "vehicles" | "customers" | "leads" | "deals" | "aiConversations" | "documents" | "tasks" | "notifications";
  count: number;
}

export function getDemoStats(): DemoStat[] {
  return [
    { key: "vehicles", count: vehiclesFixture.length },
    { key: "customers", count: customersFixture.length },
    { key: "leads", count: leadsFixture.length },
    { key: "deals", count: dealsFixture.length },
    { key: "aiConversations", count: chatThreadsFixture.length + conversationsFixture.length },
    { key: "documents", count: documentsFixture.length },
    { key: "tasks", count: tasksFixture.length },
    { key: "notifications", count: notificationsFixture.length },
  ];
}
