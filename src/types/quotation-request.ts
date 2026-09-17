import type { ID, Money } from "./common";
import type { CustomerVehicleDetails, VehicleSource } from "./vehicle-request";

export type QuotationRequestStatus = "requested" | "in_review" | "completed" | "rejected";

export interface QuotationRequest {
  id: ID;
  vehicleSource: VehicleSource;
  vehicleId?: ID;
  vehicleLabel: string;
  customerVehicle?: CustomerVehicleDetails;
  customerName?: string;
  notes?: string;
  status: QuotationRequestStatus;
  requestedAt: string;
  completedAt?: string;
  quotedPrice?: Money;
}

export interface QuotationRequestInput {
  vehicleSource: VehicleSource;
  vehicleId?: ID;
  vehicleLabel: string;
  customerVehicle?: CustomerVehicleDetails;
  customerName?: string;
  notes?: string;
}
