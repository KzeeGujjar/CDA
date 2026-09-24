import { z } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { can } from "@/server/auth/authorize";
import type { PermissionResource } from "@/server/auth/permission-catalog";
import { listVehicles } from "@/server/modules/vehicles/vehicles.service";
import { listCustomers } from "@/server/modules/customers/customers.service";
import { listLeads } from "@/server/modules/leads/leads.service";
import { listDocuments } from "@/server/modules/documents/documents.service";
import { listTasks } from "@/server/modules/tasks/tasks.service";
import { listConversations as listMessageConversations } from "@/server/modules/messages/messages.service";
import { listConversations as listAiConversations } from "@/server/modules/ai/ai-conversations.service";

/**
 * Global search (§29): searches Vehicles, Customers, Leads, Documents, Tasks, Messages and AI conversations
 * from one call. Deals is the one type the spec asks for that is NOT searched — the deals module itself does
 * not exist yet (no `POST/PATCH /api/v1/deals`, §0.17/§0.26/§0.29's same standing gap); searching a table that
 * has no real write path would be searching demo rows, which is worse than an honest omission.
 *
 * This is deliberately a thin fan-out, not a second implementation of search: every type's own `list*`
 * function (already permission-checked, scope-filtered, indexed, and tested on its own endpoint) is called
 * with the caller's query text as its existing `search` param. Two of those functions (tasks, AI
 * conversations) did not have a `search` param before this section; the other five already did. Nothing here
 * re-derives RBAC or "own vs organization" scope — reusing the real list function is what keeps this endpoint
 * from ever being able to drift out of sync with what a role may actually see.
 *
 * A type the caller cannot read is silently left out of the response — never an error, never an empty-but-
 * present entry that implies "there are none" — mirrors the dashboard-summary "composed" endpoint (§0.20).
 */

const SEARCH_TYPES = ["vehicles", "customers", "leads", "documents", "tasks", "messages", "ai_conversations"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

const TYPE_PERMISSION: Record<SearchType, PermissionResource> = {
  vehicles: "vehicles",
  customers: "customers",
  leads: "leads",
  documents: "documents",
  tasks: "tasks",
  messages: "messages",
  ai_conversations: "ai_agent",
};

export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100),
  types: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v?.split(",").map((t) => t.trim())),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(5),
  sortBy: z.enum(["relevance", "newest", "oldest"]).default("relevance"),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string | null;
  link: string;
}
interface RankedItem extends SearchResultItem {
  createdAt: string;
}

/** page()-style modules (vehicles, customers, leads, messages) vs limit/offset ones (documents, tasks, ai). */
function windowParams(mode: "page" | "offset", page: number, pageSize: number): Record<string, string> {
  return mode === "page"
    ? { page: String(page), pageSize: String(pageSize) }
    : { limit: String(pageSize), offset: String((page - 1) * pageSize) };
}

async function searchVehicles(ctx: AuthContext, q: string, page: number, pageSize: number): Promise<RankedItem[]> {
  const { items } = await listVehicles(ctx, new URLSearchParams({ search: q, ...windowParams("page", page, pageSize) }));
  return items.map((v) => ({
    id: v.id,
    title: `${v.year} ${v.make} ${v.model}`.trim(),
    subtitle: v.trim ?? v.stockNumber,
    link: `/inventory/${v.id}`,
    createdAt: v.createdAt,
  }));
}

async function searchCustomers(ctx: AuthContext, q: string, page: number, pageSize: number): Promise<RankedItem[]> {
  const { items } = await listCustomers(ctx, new URLSearchParams({ search: q, ...windowParams("page", page, pageSize) }));
  return items.map((c) => ({
    id: c.id,
    title: c.name,
    subtitle: c.email ?? c.phone,
    link: `/customers/${c.id}`,
    createdAt: c.createdAt,
  }));
}

async function searchLeads(ctx: AuthContext, q: string, page: number, pageSize: number): Promise<RankedItem[]> {
  const { items } = await listLeads(ctx, new URLSearchParams({ search: q, ...windowParams("page", page, pageSize) }));
  return items.map((l) => ({
    id: l.id,
    title: l.customer.name ?? "Unknown customer",
    subtitle: l.interestedVehicle?.label ?? null,
    link: `/leads/${l.id}`,
    createdAt: l.createdAt,
  }));
}

async function searchDocuments(ctx: AuthContext, q: string, page: number, pageSize: number): Promise<RankedItem[]> {
  const { items } = await listDocuments(ctx, new URLSearchParams({ search: q, ...windowParams("offset", page, pageSize) }));
  return items.map((d) => ({
    id: d.id,
    title: d.title,
    subtitle: d.customerName ?? d.vehicleLabel,
    link: "/contracts-documents",
    createdAt: d.createdAt,
  }));
}

async function searchTasks(ctx: AuthContext, q: string, page: number, pageSize: number): Promise<RankedItem[]> {
  const { items } = await listTasks(ctx, new URLSearchParams({ search: q, ...windowParams("offset", page, pageSize) }));
  return items.map((t) => ({
    id: t.id,
    title: t.title,
    subtitle: t.customerName ?? t.assignedToName,
    link: "/tasks",
    createdAt: t.createdAt,
  }));
}

async function searchMessages(ctx: AuthContext, q: string, page: number, pageSize: number): Promise<RankedItem[]> {
  const { items } = await listMessageConversations(ctx, new URLSearchParams({ search: q, ...windowParams("page", page, pageSize) }));
  return items.map((c) => ({
    id: c.id,
    title: c.contactName,
    subtitle: c.lastMessagePreview,
    link: "/messages",
    createdAt: c.createdAt,
  }));
}

async function searchAiConversations(ctx: AuthContext, q: string, page: number, pageSize: number): Promise<RankedItem[]> {
  // status defaults to "active" in the underlying schema; a global search should not need to know that.
  const { items } = await listAiConversations(
    ctx,
    new URLSearchParams({ search: q, status: "active", ...windowParams("offset", page, pageSize) })
  );
  return items.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: null,
    link: "/ai-assistant",
    createdAt: c.createdAt,
  }));
}

const SEARCHERS: Record<SearchType, typeof searchVehicles> = {
  vehicles: searchVehicles,
  customers: searchCustomers,
  leads: searchLeads,
  documents: searchDocuments,
  tasks: searchTasks,
  messages: searchMessages,
  ai_conversations: searchAiConversations,
};

const toResultItem = (item: RankedItem): SearchResultItem => ({
  id: item.id,
  title: item.title,
  subtitle: item.subtitle,
  link: item.link,
});

/**
 * "relevance" (the default) is genuine DB-level pagination: the underlying `list*` function's own `page`/
 * `pageSize` are passed straight through, so only the requested page is ever fetched. "newest"/"oldest" need
 * a real cross-page order the underlying query does not (and, for tasks/documents/etc., cannot) produce on
 * demand — sorting only the page already truncated to `pageSize` would sort a handful of rows and call it
 * done. Instead a single bounded window (MAX_SORT_WINDOW matches, one query, page 1) is fetched, sorted in
 * memory, and THEN sliced to the requested page — correct, and still one query per type, never one per row.
 */
const MAX_SORT_WINDOW = 100;

function rankAndSlice(items: RankedItem[], sortBy: SearchQuery["sortBy"], page: number, pageSize: number): SearchResultItem[] {
  if (sortBy === "relevance") return items.map(toResultItem);
  const rankedAll = [...items].sort((a, b) =>
    sortBy === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)
  );
  const start = (page - 1) * pageSize;
  return rankedAll.slice(start, start + pageSize).map(toResultItem);
}

export interface SearchResult {
  byType: Partial<Record<SearchType, SearchResultItem[]>>;
}

export async function globalSearch(ctx: AuthContext, query: URLSearchParams): Promise<SearchResult> {
  const q = searchQuerySchema.parse(Object.fromEntries(query.entries()));
  const requested = q.types?.filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t)) ?? [...SEARCH_TYPES];
  const permitted = requested.filter((t) => can(ctx, TYPE_PERMISSION[t], "read"));

  const byType: SearchResult["byType"] = {};
  await Promise.all(
    permitted.map(async (type) => {
      const [fetchPage, fetchSize] = q.sortBy === "relevance" ? [q.page, q.pageSize] : [1, MAX_SORT_WINDOW];
      const items = await SEARCHERS[type](ctx, q.q, fetchPage, fetchSize);
      byType[type] = rankAndSlice(items, q.sortBy, q.page, q.pageSize);
    })
  );
  return { byType };
}
