import type { QuotationRequest } from "@/types/quotation-request";

export const quotationRequestsFixture: QuotationRequest[] = [
  {
    id: "qr-001",
    vehicleSource: "inventory",
    vehicleId: "veh-005",
    vehicleLabel: "2024 BMW X7",
    customerName: "Fatima Al Suwaidi",
    status: "completed",
    requestedAt: "2026-09-07T11:00:00Z",
    completedAt: "2026-09-07T15:00:00Z",
    quotedPrice: { amount: 415000, currency: "AED" },
  },
  {
    id: "qr-002",
    vehicleSource: "customer_owned",
    vehicleLabel: "2020 Honda Accord",
    customerVehicle: { make: "Honda", model: "Accord", year: 2020, mileageKm: 58000, condition: "used" },
    customerName: "Rashid Al Nuaimi",
    notes: "Interested in trading in for a Land Cruiser.",
    status: "in_review",
    requestedAt: "2026-09-12T09:30:00Z",
  },
  {
    id: "qr-003",
    vehicleSource: "inventory",
    vehicleId: "veh-003",
    vehicleLabel: "2024 Mercedes-Benz G-Class",
    customerName: "Salem Al Ketbi",
    status: "requested",
    requestedAt: "2026-09-15T13:20:00Z",
  },
];
