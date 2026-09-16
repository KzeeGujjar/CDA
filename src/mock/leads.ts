import type { Lead } from "@/types/lead";
import { customersFixture } from "./customers";
import { vehiclesFixture } from "./vehicles";
import { salespeople } from "@/lib/salespeople";

function customer(id: string) {
  const c = customersFixture.find((x) => x.id === id)!;
  return {
    customerId: c.id,
    customerName: c.name,
    customerAvatarUrl: c.avatarUrl,
    customerPhone: c.phone,
    customerEmail: c.email,
  };
}

function vehicleLabel(id: string) {
  const v = vehiclesFixture.find((x) => x.id === id)!;
  return { interestedVehicleId: v.id, interestedVehicleLabel: `${v.year} ${v.make} ${v.model} ${v.trim}` };
}

function budgetFor(vehicleId: string, factor = 1.02) {
  const v = vehiclesFixture.find((x) => x.id === vehicleId)!;
  return { amount: Math.round((v.price.amount * factor) / 1000) * 1000, currency: v.price.currency };
}

const assignees = salespeople;

export const leadsFixture: Lead[] = [
  {
    id: "lead-001", ...customer("cus-001"), ...vehicleLabel("veh-003"), budget: budgetFor("veh-003", 1.03),
    stage: "negotiation", source: "referral", score: 88,
    assignedToName: assignees[0], lastContactAt: "2026-09-12T14:20:00Z", nextFollowUpAt: "2026-09-15T10:00:00Z", createdAt: "2026-09-01", updatedAt: "2026-09-12",
    interactions: [
      { id: "int-1", type: "call", summary: "Discussed financing options for the G63 AMG.", createdAt: "2026-09-10", authorName: assignees[0] },
      { id: "int-2", type: "whatsapp", summary: "Sent updated pricing with VAT breakdown.", createdAt: "2026-09-12", authorName: assignees[0] },
    ],
  },
  {
    id: "lead-002", ...customer("cus-002"), ...vehicleLabel("veh-007"), budget: budgetFor("veh-007", 0.98),
    stage: "viewing", source: "website", score: 74,
    assignedToName: assignees[1], lastContactAt: "2026-09-11T09:45:00Z", nextFollowUpAt: "2026-09-16T13:00:00Z", createdAt: "2026-09-04", updatedAt: "2026-09-11",
    interactions: [{ id: "int-3", type: "visit", summary: "Test drove the Range Rover Sport at showroom.", createdAt: "2026-09-11", authorName: assignees[1] }],
  },
  {
    id: "lead-003", ...customer("cus-003"), ...vehicleLabel("veh-009"), budget: budgetFor("veh-009", 1.0),
    stage: "new", source: "marketplace", score: 42,
    assignedToName: assignees[2], lastContactAt: "2026-09-12T08:00:00Z", nextFollowUpAt: "2026-09-14T09:00:00Z", createdAt: "2026-09-12", updatedAt: "2026-09-12",
    interactions: [{ id: "int-4", type: "note", summary: "Inbound inquiry via Dubizzle listing.", createdAt: "2026-09-12", authorName: assignees[2] }],
  },
  {
    id: "lead-004", ...customer("cus-004"), ...vehicleLabel("veh-016"), budget: budgetFor("veh-016", 0.95),
    stage: "contacted", source: "walk_in", score: 55,
    assignedToName: assignees[3], lastContactAt: "2026-09-10T16:10:00Z", nextFollowUpAt: "2026-09-15T15:30:00Z", createdAt: "2026-09-08", updatedAt: "2026-09-10",
    interactions: [{ id: "int-5", type: "call", summary: "Confirmed budget range and preferred colors.", createdAt: "2026-09-10", authorName: assignees[3] }],
  },
  {
    id: "lead-005", ...customer("cus-005"), ...vehicleLabel("veh-011"), budget: budgetFor("veh-011", 1.0),
    stage: "won", source: "referral", score: 95,
    assignedToName: assignees[0], lastContactAt: "2026-09-02T11:00:00Z", createdAt: "2026-08-20", updatedAt: "2026-09-02",
    interactions: [{ id: "int-6", type: "note", summary: "Deal closed — converted to contract.", createdAt: "2026-09-02", authorName: assignees[0] }],
  },
  {
    id: "lead-006", ...customer("cus-006"), ...vehicleLabel("veh-017"), budget: budgetFor("veh-017", 1.05),
    stage: "negotiation", source: "phone", score: 91,
    assignedToName: assignees[1], lastContactAt: "2026-09-13T10:30:00Z", nextFollowUpAt: "2026-09-14T11:00:00Z", createdAt: "2026-09-06", updatedAt: "2026-09-13",
    interactions: [
      { id: "int-7", type: "call", summary: "Discussing trade-in valuation for existing Bentayga.", createdAt: "2026-09-13", authorName: assignees[1] },
    ],
  },
  {
    id: "lead-007", ...customer("cus-007"), ...vehicleLabel("veh-013"), budget: budgetFor("veh-013", 0.97),
    stage: "viewing", source: "social_media", score: 68,
    assignedToName: assignees[2], lastContactAt: "2026-09-11T13:15:00Z", nextFollowUpAt: "2026-09-17T10:00:00Z", createdAt: "2026-09-09", updatedAt: "2026-09-11",
    interactions: [{ id: "int-8", type: "email", summary: "Sent Model X Plaid brochure and delivery timeline.", createdAt: "2026-09-11", authorName: assignees[2] }],
  },
  {
    id: "lead-008", ...customer("cus-008"), ...vehicleLabel("veh-015"), budget: budgetFor("veh-015", 1.0),
    stage: "contacted", source: "walk_in", score: 60,
    assignedToName: assignees[3], lastContactAt: "2026-09-10T09:00:00Z", nextFollowUpAt: "2026-09-16T09:30:00Z", createdAt: "2026-09-07", updatedAt: "2026-09-10",
    interactions: [{ id: "int-9", type: "visit", summary: "Fleet inquiry — evaluating 3x Yukon Denali for company fleet.", createdAt: "2026-09-10", authorName: assignees[3] }],
  },
  {
    id: "lead-009", ...customer("cus-009"), ...vehicleLabel("veh-012"), budget: budgetFor("veh-012", 0.9),
    stage: "new", source: "website", score: 38,
    assignedToName: assignees[0], lastContactAt: "2026-09-13T07:30:00Z", nextFollowUpAt: "2026-09-14T14:00:00Z", createdAt: "2026-09-13", updatedAt: "2026-09-13",
    interactions: [{ id: "int-10", type: "note", summary: "Requested callback about Palisade availability.", createdAt: "2026-09-13", authorName: assignees[0] }],
  },
  {
    id: "lead-010", ...customer("cus-010"), ...vehicleLabel("veh-018"), budget: budgetFor("veh-018", 0.85),
    stage: "lost", source: "marketplace", score: 25,
    assignedToName: assignees[1], lastContactAt: "2026-08-29T12:00:00Z", createdAt: "2026-08-15", updatedAt: "2026-08-29",
    interactions: [{ id: "int-11", type: "note", summary: "Went with a competitor dealership offering lower price.", createdAt: "2026-08-29", authorName: assignees[1] }],
  },
  {
    id: "lead-011", ...customer("cus-011"), ...vehicleLabel("veh-004"), budget: budgetFor("veh-004", 1.02),
    stage: "negotiation", source: "referral", score: 82,
    assignedToName: assignees[2], lastContactAt: "2026-09-12T15:45:00Z", nextFollowUpAt: "2026-09-15T16:00:00Z", createdAt: "2026-09-05", updatedAt: "2026-09-12",
    interactions: [{ id: "int-12", type: "whatsapp", summary: "Negotiating final price on LX 600 VIP.", createdAt: "2026-09-12", authorName: assignees[2] }],
  },
  {
    id: "lead-012", ...customer("cus-012"), ...vehicleLabel("veh-008"), budget: budgetFor("veh-008", 0.96),
    stage: "qualified", source: "website", score: 71,
    assignedToName: assignees[3], lastContactAt: "2026-09-12T10:00:00Z", nextFollowUpAt: "2026-09-18T10:00:00Z", createdAt: "2026-09-10", updatedAt: "2026-09-12",
    interactions: [{ id: "int-13", type: "call", summary: "Interested in the F-150 Raptor, asked about import history.", createdAt: "2026-09-12", authorName: assignees[3] }],
  },
  {
    id: "lead-013", ...customer("cus-013"), ...vehicleLabel("veh-001"), budget: budgetFor("veh-001", 1.0),
    stage: "won", source: "referral", score: 97,
    assignedToName: assignees[0], lastContactAt: "2026-09-01T09:00:00Z", createdAt: "2026-08-22", updatedAt: "2026-09-01",
    interactions: [{ id: "int-14", type: "note", summary: "Land Cruiser GXR deal closed at full price.", createdAt: "2026-09-01", authorName: assignees[0] }],
  },
  {
    id: "lead-014", ...customer("cus-014"), ...vehicleLabel("veh-020"), budget: budgetFor("veh-020", 0.92),
    stage: "contacted", source: "phone", score: 48,
    assignedToName: assignees[1], lastContactAt: "2026-09-11T14:00:00Z", nextFollowUpAt: "2026-09-16T12:00:00Z", createdAt: "2026-09-09", updatedAt: "2026-09-11",
    interactions: [{ id: "int-15", type: "call", summary: "Asked about Jeep Wrangler 4xe hybrid range.", createdAt: "2026-09-11", authorName: assignees[1] }],
  },
  {
    id: "lead-015", ...customer("cus-015"), ...vehicleLabel("veh-002"), budget: budgetFor("veh-002", 1.0),
    stage: "qualified", source: "marketplace", score: 65,
    assignedToName: assignees[2], lastContactAt: "2026-09-11T11:30:00Z", nextFollowUpAt: "2026-09-17T09:00:00Z", createdAt: "2026-09-08", updatedAt: "2026-09-11",
    interactions: [{ id: "int-16", type: "email", summary: "Requested Patrol Platinum service history.", createdAt: "2026-09-11", authorName: assignees[2] }],
  },
];
