import type { ID, Money } from "./common";
import type { CustomerVehicleDetails, VehicleSource } from "./vehicle-request";

export type UaeBankCode = "adib" | "adcb" | "eib" | "enbd" | "dib" | "fab" | "al_hilal" | "al_mashreq";

export interface UaeBank {
  code: UaeBankCode;
  name: string;
  shortName: string;
}

export type BankEvaluationStatus = "requested" | "in_review" | "completed" | "rejected";

export interface BankEvaluationRequest {
  id: ID;
  vehicleSource: VehicleSource;
  vehicleId?: ID;
  vehicleLabel: string;
  customerVehicle?: CustomerVehicleDetails;
  bankCode: UaeBankCode;
  bankName: string;
  customerName?: string;
  financeAmount: Money;
  fee: Money;
  status: BankEvaluationStatus;
  requestedAt: string;
  completedAt?: string;
  estimatedValue?: Money;
  reportReference?: string;
  notes?: string;
}

export interface BankEvaluationInput {
  vehicleSource: VehicleSource;
  vehicleId?: ID;
  vehicleLabel: string;
  customerVehicle?: CustomerVehicleDetails;
  bankCode: UaeBankCode;
  financeAmount: Money;
  customerName?: string;
  notes?: string;
}
