import type { ApiError, Currency, ID } from "@/types/common";
import type { Lead, LeadFilters, LeadInput, LeadInteraction, LeadStage } from "@/types/lead";
import { leadsFixture } from "@/mock/leads";
import { getCustomerById } from "@/services/customerService";
import { getVehicleById } from "@/services/vehicleService";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

/**
 * Leads. Connected to /api/v1/leads: with a real session, listing, reading, creating and moving a lead along all
 * go through the database (own/branch scope, tenant isolation). Without one, the built-in demo data is used.
 *
 * The UI picks an assignee by NAME (a `Select` of `salespeople`, §0.7); the backend assigns by user id, so
 * `createLead`/`getLeads({ assignedToName })` resolve the name against GET /users first.
 *
 * The interaction log (calls, WhatsApp, visits, notes) has no backing table yet (§0.12), so it is never persisted
 * anywhere, live or demo: it lives only in this tab, for the session, in `sessionInteractions` below, and is
 * merged into whatever getLeadById returns — the lead detail page's "add note" keeps working either way.
 */
let leads: Lead[] = [...leadsFixture];
const sessionInteractions = new Map<ID, LeadInteraction[]>();

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function withSessionInteractions(lead: Lead): Lead {
  const extra = sessionInteractions.get(lead.id);
  return extra?.length ? { ...lead, interactions: [...extra, ...lead.interactions] } : lead;
}

async function demoGetLeads(filters?: LeadFilters): Promise<Lead[]> {
  await wait();
  return leads.filter((lead) => {
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const haystack =
        `${lead.customerName} ${lead.customerEmail} ${lead.customerPhone} ${lead.interestedVehicleLabel ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters?.stage && lead.stage !== filters.stage) return false;
    if (filters?.assignedToName && lead.assignedToName !== filters.assignedToName) return false;
    return true;
  });
}

async function demoGetLeadById(id: ID): Promise<Lead | null> {
  await wait(200);
  return leads.find((l) => l.id === id) ?? null;
}

async function demoGetLeadsByCustomerId(customerId: ID): Promise<Lead[]> {
  await wait(150);
  return leads.filter((l) => l.customerId === customerId);
}

async function demoCreateLead(input: LeadInput): Promise<Lead> {
  await wait();
  const customer = await getCustomerById(input.customerId);
  if (!customer) throw new Error("Customer not found");
  const vehicle = input.interestedVehicleId ? await getVehicleById(input.interestedVehicleId) : null;
  const now = new Date().toISOString();
  const lead: Lead = {
    id: `lead-${Math.random().toString(36).slice(2, 9)}`,
    customerId: customer.id,
    customerName: customer.name,
    customerAvatarUrl: customer.avatarUrl,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    interestedVehicleId: vehicle?.id,
    interestedVehicleLabel: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}` : undefined,
    budget: input.budget,
    stage: "new",
    source: input.source,
    score: 30,
    assignedToName: input.assignedToName,
    createdAt: now,
    updatedAt: now,
    interactions: [],
  };
  leads = [lead, ...leads];
  return lead;
}

async function demoUpdateLeadStage(id: ID, stage: LeadStage): Promise<Lead> {
  await wait();
  const index = leads.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("Lead not found");
  leads[index] = { ...leads[index], stage, updatedAt: new Date().toISOString() };
  return leads[index];
}

async function demoUpdateLeadFollowUp(id: ID, nextFollowUpAt: string): Promise<Lead> {
  await wait();
  const index = leads.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("Lead not found");
  leads[index] = { ...leads[index], nextFollowUpAt, updatedAt: new Date().toISOString() };
  return leads[index];
}

// ─────────────────────────────────────────── live ───────────────────────────────────────────

interface LeadDto {
  id: string;
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
  interestedVehicle: { id: string; label: string | null } | null;
  currency: string;
  budget: number | null;
  stage: string;
  source: string;
  score: number;
  assignedTo: { id: string; name: string } | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface LeadListDto {
  items: LeadDto[];
  total: number;
}

function toLead(d: LeadDto): Lead {
  return {
    id: d.id,
    customerId: d.customer.id,
    // "" (not "unknown customer") when the signed-in role cannot read customer details (needs customers:read).
    customerName: d.customer.name ?? "",
    customerPhone: d.customer.phone ?? "",
    customerEmail: d.customer.email ?? "",
    interestedVehicleId: d.interestedVehicle?.id,
    interestedVehicleLabel: d.interestedVehicle?.label ?? undefined,
    budget: d.budget !== null ? { amount: d.budget, currency: d.currency as Currency } : undefined,
    stage: d.stage as LeadStage,
    source: d.source as Lead["source"],
    score: d.score,
    assignedToName: d.assignedTo?.name ?? "Unassigned",
    lastContactAt: d.lastContactAt ?? undefined,
    nextFollowUpAt: d.nextFollowUpAt ?? undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    interactions: [],
  };
}

/** The UI assigns by name; the API assigns by user id. null when no active user of this organization has that name. */
async function resolveUserIdByName(name: string): Promise<string | null> {
  const users = unwrapBackend(await backendRequest<{ id: string; name: string }[]>("GET", "/users"));
  return users.find((u) => u.name === name)?.id ?? null;
}

async function liveGetLeads(filters?: LeadFilters): Promise<Lead[]> {
  const q = new URLSearchParams();
  if (filters?.search) q.set("search", filters.search);
  if (filters?.stage) q.set("stage", filters.stage);
  if (filters?.assignedToName) {
    const assignedToId = await resolveUserIdByName(filters.assignedToName);
    if (!assignedToId) return []; // nobody by that name: the honest answer is no matching leads, not an error
    q.set("assignedToId", assignedToId);
  }
  const items: Lead[] = [];
  const pageSize = 200;
  for (let page = 1; page <= 10; page++) {
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    const dto = unwrapBackend(await backendRequest<LeadListDto>("GET", `/leads?${q.toString()}`));
    items.push(...dto.items.map(toLead).map(withSessionInteractions));
    if (items.length >= dto.total || dto.items.length === 0) break;
  }
  return items;
}

async function liveGetLeadById(id: ID): Promise<Lead | null> {
  const result = await backendRequest<LeadDto>("GET", `/leads/${id}`);
  if (result.kind === "error" && result.error.status === 404) return null;
  return withSessionInteractions(toLead(unwrapBackend(result)));
}

async function liveGetLeadsByCustomerId(customerId: ID): Promise<Lead[]> {
  const dto = unwrapBackend(
    await backendRequest<LeadListDto>("GET", `/leads?customerId=${encodeURIComponent(customerId)}&pageSize=200`)
  );
  return dto.items.map(toLead).map(withSessionInteractions);
}

async function liveCreateLead(input: LeadInput): Promise<Lead> {
  const assignedToId = await resolveUserIdByName(input.assignedToName);
  if (!assignedToId) {
    const error: ApiError = {
      message: `No one named "${input.assignedToName}" was found.`,
      code: "validation_error",
      status: 400,
      fieldErrors: [{ path: "assignedToName", message: "Select a valid salesperson." }],
    };
    throw error;
  }
  const body = {
    customerId: input.customerId,
    source: input.source,
    interestedVehicleId: input.interestedVehicleId,
    budget: input.budget?.amount,
    assignedToId,
  };
  return toLead(unwrapBackend(await backendRequest<LeadDto>("POST", "/leads", body)));
}

async function liveUpdateLeadStage(id: ID, stage: LeadStage): Promise<Lead> {
  return withSessionInteractions(
    toLead(unwrapBackend(await backendRequest<LeadDto>("PUT", `/leads/${id}`, { stage })))
  );
}

async function liveUpdateLeadFollowUp(id: ID, nextFollowUpAt: string): Promise<Lead> {
  return withSessionInteractions(
    toLead(unwrapBackend(await backendRequest<LeadDto>("PUT", `/leads/${id}`, { nextFollowUpAt })))
  );
}

// ─────────────────────────────────────────── exported ───────────────────────────────────────────

export function getLeads(filters?: LeadFilters): Promise<Lead[]> {
  return liveOrDemo({ live: () => liveGetLeads(filters), demo: () => demoGetLeads(filters) });
}

export function getLeadById(id: ID): Promise<Lead | null> {
  return liveOrDemo({ live: () => liveGetLeadById(id), demo: () => demoGetLeadById(id) });
}

export function getLeadsByCustomerId(customerId: ID): Promise<Lead[]> {
  return liveOrDemo({
    live: () => liveGetLeadsByCustomerId(customerId),
    demo: () => demoGetLeadsByCustomerId(customerId),
  });
}

export function createLead(input: LeadInput): Promise<Lead> {
  return liveOrDemo({ live: () => liveCreateLead(input), demo: () => demoCreateLead(input) });
}

export function updateLeadStage(id: ID, stage: LeadStage): Promise<Lead> {
  return liveOrDemo({ live: () => liveUpdateLeadStage(id, stage), demo: () => demoUpdateLeadStage(id, stage) });
}

export function updateLeadFollowUp(id: ID, nextFollowUpAt: string): Promise<Lead> {
  return liveOrDemo({
    live: () => liveUpdateLeadFollowUp(id, nextFollowUpAt),
    demo: () => demoUpdateLeadFollowUp(id, nextFollowUpAt),
  });
}

/**
 * Session-only, live or demo alike (see the module comment): nothing here is ever persisted server-side.
 */
export async function addLeadInteraction(
  id: ID,
  interaction: Omit<LeadInteraction, "id" | "createdAt">
): Promise<Lead> {
  await wait(150);
  const newInteraction: LeadInteraction = {
    ...interaction,
    id: `int-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  sessionInteractions.set(id, [newInteraction, ...(sessionInteractions.get(id) ?? [])]);
  // Demo mode also stamps lastContactAt, matching the section-13 UI that shows "last contact" for it.
  const demoIndex = leads.findIndex((l) => l.id === id);
  if (demoIndex !== -1) leads[demoIndex] = { ...leads[demoIndex], lastContactAt: new Date().toISOString() };
  const lead = await getLeadById(id);
  if (!lead) throw new Error("Lead not found");
  return lead;
}
