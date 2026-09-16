import type { Deal } from "@/types/deal";
import { customersFixture } from "./customers";
import { vehiclesFixture } from "./vehicles";

function build(
  id: string,
  ref: string,
  customerId: string,
  vehicleId: string,
  status: Deal["status"],
  createdAt: string,
  updatedAt: string
): Deal {
  const customer = customersFixture.find((c) => c.id === customerId)!;
  const vehicle = vehiclesFixture.find((v) => v.id === vehicleId)!;
  const vatRate = 0.05;
  const lineItems = [
    { id: `${id}-li-1`, label: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`, amount: vehicle.price },
  ];
  const subtotal = lineItems.reduce((sum, li) => sum + li.amount.amount, 0);
  const vatAmount = Math.round(subtotal * vatRate);
  return {
    id,
    reference: ref,
    customerId: customer.id,
    customerName: customer.name,
    vehicleId: vehicle.id,
    vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
    status,
    lineItems,
    vatRate,
    subtotal: { amount: subtotal, currency: "AED" },
    vatAmount: { amount: vatAmount, currency: "AED" },
    total: { amount: subtotal + vatAmount, currency: "AED" },
    createdAt,
    updatedAt,
  };
}

export const dealsFixture: Deal[] = [
  build("deal-001", "QT-2026-0091", "cus-001", "veh-003", "sent", "2026-09-10", "2026-09-12"),
  build("deal-002", "QT-2026-0090", "cus-006", "veh-017", "draft", "2026-09-11", "2026-09-13"),
  build("deal-003", "QT-2026-0088", "cus-011", "veh-004", "sent", "2026-09-08", "2026-09-12"),
  build("deal-004", "QT-2026-0085", "cus-013", "veh-001", "converted_to_contract", "2026-08-25", "2026-09-01"),
  build("deal-005", "QT-2026-0082", "cus-005", "veh-011", "converted_to_contract", "2026-08-21", "2026-09-02"),
  build("deal-006", "QT-2026-0079", "cus-002", "veh-007", "accepted", "2026-09-05", "2026-09-11"),
  build("deal-007", "QT-2026-0075", "cus-007", "veh-013", "sent", "2026-09-09", "2026-09-11"),
  build("deal-008", "QT-2026-0070", "cus-010", "veh-018", "declined", "2026-08-16", "2026-08-29"),
  build("deal-009", "QT-2026-0066", "cus-008", "veh-015", "draft", "2026-09-10", "2026-09-10"),
  build("deal-010", "QT-2026-0060", "cus-015", "veh-002", "sent", "2026-09-08", "2026-09-11"),
];
