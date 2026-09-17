import type { QuotationRequest, QuotationRequestInput } from "@/types/quotation-request";
import { quotationRequestsFixture } from "@/mock/quotation-requests";

let requests: QuotationRequest[] = [...quotationRequestsFixture];

const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getQuotationRequests(): Promise<QuotationRequest[]> {
  await wait();
  return [...requests].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function requestQuotation(input: QuotationRequestInput): Promise<QuotationRequest> {
  await wait(600);

  const request: QuotationRequest = {
    id: `qr-${Math.random().toString(36).slice(2, 9)}`,
    vehicleSource: input.vehicleSource,
    vehicleId: input.vehicleId,
    vehicleLabel: input.vehicleLabel,
    customerVehicle: input.customerVehicle,
    customerName: input.customerName,
    notes: input.notes,
    status: "requested",
    requestedAt: new Date().toISOString(),
  };
  requests = [request, ...requests];
  return request;
}
