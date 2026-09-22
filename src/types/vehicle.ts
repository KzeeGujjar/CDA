import type { ID, Money, SortDirection } from "./common";

export type VehicleStatus =
  | "available"
  | "reserved"
  | "sold"
  | "purchased"
  | "in_transit"
  | "under_inspection"
  | "under_repair"
  | "archived";

export type VehicleCondition = "new" | "used" | "certified_pre_owned";

export type FuelType = "petrol" | "diesel" | "hybrid" | "electric";

export type Transmission = "automatic" | "manual";

export type ImportSpec = "GCC" | "UAE" | "Imported";

export type AccidentHistory = "none" | "minor" | "major";

export type ServiceHistoryStatus = "full" | "partial" | "none";

export type Emirate = "dubai" | "abu_dhabi" | "sharjah" | "ajman" | "ras_al_khaimah" | "fujairah" | "umm_al_quwain";

export type VehicleSourceType = "export" | "import" | "auction" | "dealer" | "private";

export type RegistrationStatus = "registered" | "not_registered" | "pending_transfer";

export interface VehicleRegistration {
  status: RegistrationStatus;
  plateNumber?: string;
  expiryDate?: string;
  rtaNotes?: string;
}

export interface VehicleSpec {
  engine: string;
  horsepower: number;
  fuelType: FuelType;
  transmission: Transmission;
  mileageKm: number;
  exteriorColor: string;
  interiorColor: string;
  seats: number;
  bodyType: string;
  vin: string;
  /** Absent when not recorded (the create/edit forms always set it; a record made another way may not). */
  importSpec?: ImportSpec;
  accidentHistory: AccidentHistory;
  serviceHistory: ServiceHistoryStatus;
  owners: number;
}

export interface Vehicle {
  id: ID;
  stockNumber: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  condition: VehicleCondition;
  status: VehicleStatus;
  price: Money;
  /**
   * What the dealership paid. ABSENT (not zero) when the signed-in role may not see cost figures. Everything that
   * shows or adds costs must handle that: use costsVisible() / getTotalCost() from lib/vehicle-finance.
   */
  costPrice?: Money;
  repairCost?: Money;
  transportCost?: Money;
  otherCost?: Money;
  expectedSellingPrice: Money;
  estimatedMarketValue: Money;
  spec: VehicleSpec;
  images: string[];
  daysInStock: number;
  acquiredAt: string;
  /** Absent when not recorded (the create/edit forms always set it; a record made another way may not). */
  location?: string;
  emirate?: Emirate;
  /** Where the dealership got it; absent when not recorded. */
  sourceType?: VehicleSourceType;
  registration: VehicleRegistration;
  featured?: boolean;
  notes?: string;
}

export type VehicleSortField = "price" | "year" | "daysInStock" | "acquiredAt";

export interface VehicleFilters {
  search?: string;
  make?: string;
  status?: VehicleStatus;
  condition?: VehicleCondition;
  minPrice?: number;
  maxPrice?: number;
  emirate?: Emirate;
  sourceType?: VehicleSourceType;
  page?: number;
  pageSize?: number;
  sortBy?: VehicleSortField;
  sortDirection?: SortDirection;
}

export type VehicleInput = Omit<Vehicle, "id" | "daysInStock" | "acquiredAt">;
