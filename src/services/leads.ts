import type { ID } from "@/types/common";
import type { Lead, LeadFilters, LeadInput, LeadInteraction, LeadStage } from "@/types/lead";
import { leadsFixture } from "@/mock/leads";
import { getCustomerById } from "@/services/customers";
import { getVehicleById } from "@/services/vehicles";

let leads: Lead[] = [...leadsFixture];

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getLeads(filters?: LeadFilters): Promise<Lead[]> {
  await wait();
  return leads.filter((lead) => {
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${lead.customerName} ${lead.customerEmail} ${lead.customerPhone} ${lead.interestedVehicleLabel ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters?.stage && lead.stage !== filters.stage) return false;
    if (filters?.assignedToName && lead.assignedToName !== filters.assignedToName) return false;
    return true;
  });
}

export async function getLeadById(id: ID): Promise<Lead | null> {
  await wait(200);
  return leads.find((l) => l.id === id) ?? null;
}

export async function getLeadsByCustomerId(customerId: ID): Promise<Lead[]> {
  await wait(150);
  return leads.filter((l) => l.customerId === customerId);
}

export async function createLead(input: LeadInput): Promise<Lead> {
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

export async function updateLeadStage(id: ID, stage: LeadStage): Promise<Lead> {
  await wait();
  const index = leads.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("Lead not found");
  leads[index] = { ...leads[index], stage, updatedAt: new Date().toISOString() };
  return leads[index];
}

export async function updateLeadFollowUp(id: ID, nextFollowUpAt: string): Promise<Lead> {
  await wait();
  const index = leads.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("Lead not found");
  leads[index] = { ...leads[index], nextFollowUpAt, updatedAt: new Date().toISOString() };
  return leads[index];
}

export async function addLeadInteraction(
  id: ID,
  interaction: Omit<LeadInteraction, "id" | "createdAt">
): Promise<Lead> {
  await wait();
  const index = leads.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("Lead not found");
  const newInteraction: LeadInteraction = {
    ...interaction,
    id: `int-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  const now = new Date().toISOString();
  leads[index] = {
    ...leads[index],
    interactions: [newInteraction, ...leads[index].interactions],
    lastContactAt: now,
    updatedAt: now,
  };
  return leads[index];
}
