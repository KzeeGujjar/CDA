import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";
import { getVehicles } from "@/services/vehicleService";
import { getCustomers } from "@/services/customerService";
import { getLeads } from "@/services/leadService";
import { getDocuments } from "@/services/documentService";
import { getTasks } from "@/services/taskService";
import { getConversations } from "@/services/messageService";
import { getChatThreads } from "@/services/aiService";

/**
 * Global search (§29): one call instead of the command palette's previous approach of fetching every vehicle,
 * customer, lead, document, task, conversation and chat thread in full on every keystroke — harmless against
 * the small demo fixtures, but a real problem against a real backend's full inventory. Live mode now hits the
 * server's own search (already permission-checked, tenant-scoped, indexed); demo mode does the equivalent
 * client-side substring match over the same small fixtures it always used, so both modes behave the same way
 * — the deals group in the command palette is untouched (demo-only; the deals module itself has no backend yet).
 */

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string | null;
  link: string;
}
export interface GroupedSearchResults {
  vehicles: SearchResultItem[];
  customers: SearchResultItem[];
  leads: SearchResultItem[];
  documents: SearchResultItem[];
  tasks: SearchResultItem[];
  messages: SearchResultItem[];
  aiConversations: SearchResultItem[];
}
const EMPTY: GroupedSearchResults = { vehicles: [], customers: [], leads: [], documents: [], tasks: [], messages: [], aiConversations: [] };

interface ByTypeDto {
  vehicles?: SearchResultItem[];
  customers?: SearchResultItem[];
  leads?: SearchResultItem[];
  documents?: SearchResultItem[];
  tasks?: SearchResultItem[];
  messages?: SearchResultItem[];
  ai_conversations?: SearchResultItem[];
}

async function liveSearch(q: string): Promise<GroupedSearchResults> {
  const res = unwrapBackend(await backendRequest<{ byType: ByTypeDto }>("GET", `/search?q=${encodeURIComponent(q)}`));
  return {
    vehicles: res.byType.vehicles ?? [],
    customers: res.byType.customers ?? [],
    leads: res.byType.leads ?? [],
    documents: res.byType.documents ?? [],
    tasks: res.byType.tasks ?? [],
    messages: res.byType.messages ?? [],
    aiConversations: res.byType.ai_conversations ?? [],
  };
}

const CAP = 5;
const match = (needle: string, ...fields: (string | null | undefined)[]) =>
  fields.some((f) => f?.toLowerCase().includes(needle));

async function demoSearch(q: string): Promise<GroupedSearchResults> {
  const needle = q.trim().toLowerCase();
  if (!needle) return EMPTY;

  const [vehicles, customers, leads, documents, tasks, conversations, chatThreads] = await Promise.all([
    getVehicles(),
    getCustomers(),
    getLeads(),
    getDocuments(),
    getTasks(),
    getConversations(),
    getChatThreads(),
  ]);

  return {
    vehicles: vehicles
      .filter((v) => match(needle, v.make, v.model, v.trim, v.stockNumber, v.spec.vin))
      .slice(0, CAP)
      .map((v) => ({ id: v.id, title: `${v.year} ${v.make} ${v.model}`, subtitle: v.trim ?? v.stockNumber, link: `/inventory/${v.id}` })),
    customers: customers
      .filter((c) => match(needle, c.name, c.email, c.phone))
      .slice(0, CAP)
      .map((c) => ({ id: c.id, title: c.name, subtitle: c.email ?? c.phone ?? null, link: `/customers/${c.id}` })),
    leads: leads
      .filter((l) => match(needle, l.customerName, l.interestedVehicleLabel))
      .slice(0, CAP)
      .map((l) => ({ id: l.id, title: l.customerName, subtitle: l.interestedVehicleLabel ?? null, link: `/leads/${l.id}` })),
    documents: documents
      .filter((d) => match(needle, d.title, d.customerName, d.vehicleLabel))
      .slice(0, CAP)
      .map((d) => ({ id: d.id, title: d.title, subtitle: d.customerName ?? d.vehicleLabel ?? null, link: "/contracts-documents" })),
    tasks: tasks
      .filter((t) => match(needle, t.title, t.customerName, t.assignedToName))
      .slice(0, CAP)
      .map((t) => ({ id: t.id, title: t.title, subtitle: t.customerName ?? t.assignedToName ?? null, link: "/tasks" })),
    messages: conversations
      .filter((c) => match(needle, c.contactName, c.lastMessagePreview))
      .slice(0, CAP)
      .map((c) => ({ id: c.id, title: c.contactName, subtitle: c.lastMessagePreview ?? null, link: "/messages" })),
    aiConversations: chatThreads
      .filter((t) => match(needle, t.title, t.lastMessagePreview))
      .slice(0, CAP)
      .map((t) => ({ id: t.id, title: t.title, subtitle: t.lastMessagePreview ?? null, link: "/ai-assistant" })),
  };
}

export function globalSearch(q: string): Promise<GroupedSearchResults> {
  if (!q.trim()) return Promise.resolve(EMPTY);
  return liveOrDemo({ live: () => liveSearch(q), demo: () => demoSearch(q) });
}
