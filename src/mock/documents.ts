import type { ContractDocument } from "@/types/document";
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

export const documentsFixture: ContractDocument[] = [
  {
    id: "doc-001", type: "purchase_agreement", title: "Purchase Agreement — G-Wagon Trade-in",
    ...link("cus-001", "veh-003"), status: "signed", createdByName: salespeople[0],
    createdAt: "2026-09-01", updatedAt: "2026-09-03",
  },
  {
    id: "doc-002", type: "quotation", title: "Quotation — Range Rover Sport",
    ...link("cus-002", "veh-007"), status: "pending_signature", createdByName: salespeople[1],
    createdAt: "2026-09-10", updatedAt: "2026-09-11",
  },
  {
    id: "doc-003", type: "sales_agreement", title: "Sales Agreement — LX 600 VIP",
    ...link("cus-011", "veh-004"), status: "pending_signature", createdByName: salespeople[2],
    createdAt: "2026-09-09", updatedAt: "2026-09-12",
  },
  {
    id: "doc-004", type: "invoice", title: "Invoice — Land Cruiser GXR",
    ...link("cus-013", "veh-001"), status: "completed", createdByName: salespeople[0],
    createdAt: "2026-08-28", updatedAt: "2026-09-01",
  },
  {
    id: "doc-005", type: "receipt", title: "Receipt — Land Cruiser GXR Deposit",
    ...link("cus-013", "veh-001"), status: "completed", createdByName: salespeople[0],
    createdAt: "2026-08-29", updatedAt: "2026-08-29",
  },
  {
    id: "doc-006", type: "inspection_report", title: "Inspection Report — Bentayga EWB",
    ...link("cus-006", "veh-017"), status: "signed", createdByName: salespeople[1],
    createdAt: "2026-09-05", updatedAt: "2026-09-06",
  },
  {
    id: "doc-007", type: "delivery_form", title: "Delivery Form — LX 600",
    ...link("cus-005", "veh-011"), status: "signed", createdByName: salespeople[0],
    createdAt: "2026-09-02", updatedAt: "2026-09-02",
  },
  {
    id: "doc-008", type: "customer_agreement", title: "Customer Agreement — Fleet Terms",
    ...link("cus-008", "veh-015"), status: "draft", createdByName: salespeople[3],
    createdAt: "2026-09-10", updatedAt: "2026-09-10",
  },
  {
    id: "doc-009", type: "quotation", title: "Quotation — Model X Plaid",
    ...link("cus-007", "veh-013"), status: "draft", createdByName: salespeople[2],
    createdAt: "2026-09-11", updatedAt: "2026-09-11",
  },
  {
    id: "doc-010", type: "inspection_report", title: "Inspection Report — F-150 Raptor",
    ...link("cus-012", "veh-008"), status: "draft", createdByName: salespeople[3],
    createdAt: "2026-09-12", updatedAt: "2026-09-12",
  },
  {
    id: "doc-011", type: "purchase_agreement", title: "Purchase Agreement — Patrol Platinum Trade-in",
    ...link("cus-015", "veh-002"), status: "pending_signature", createdByName: salespeople[2],
    createdAt: "2026-09-08", updatedAt: "2026-09-11",
  },
  {
    id: "doc-012", type: "delivery_form", title: "Delivery Form — Wrangler 4xe",
    ...link("cus-014", "veh-020"), status: "draft", createdByName: salespeople[1],
    createdAt: "2026-09-11", updatedAt: "2026-09-11",
  },
];
