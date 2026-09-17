import type { VehicleCondition } from "./vehicle";

export type VehicleSource = "inventory" | "customer_owned";

export interface CustomerVehicleDetails {
  make: string;
  model: string;
  variant?: string;
  year: number;
  mileageKm: number;
  condition: VehicleCondition;
  specifications?: string;
}
