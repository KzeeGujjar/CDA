import type { ID, PaginatedResult } from "@/types/common";
import type { Vehicle, VehicleFilters, VehicleInput, VehicleSortField } from "@/types/vehicle";
import { vehiclesFixture } from "@/mock/vehicles";

let vehicles: Vehicle[] = [...vehiclesFixture];

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function applyFilters(list: Vehicle[], filters?: VehicleFilters): Vehicle[] {
  if (!filters) return list;
  return list.filter((v) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${v.make} ${v.model} ${v.trim} ${v.spec.vin}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.make && v.make !== filters.make) return false;
    if (filters.status && v.status !== filters.status) return false;
    if (filters.condition && v.condition !== filters.condition) return false;
    if (filters.minPrice && v.price.amount < filters.minPrice) return false;
    if (filters.maxPrice && v.price.amount > filters.maxPrice) return false;
    if (filters.emirate && v.emirate !== filters.emirate) return false;
    if (filters.sourceType && v.sourceType !== filters.sourceType) return false;
    return true;
  });
}

function applySort(list: Vehicle[], sortBy?: VehicleSortField, direction: "asc" | "desc" = "desc"): Vehicle[] {
  if (!sortBy) return list;
  const sorted = [...list].sort((a, b) => {
    const valueOf = (v: Vehicle) => {
      switch (sortBy) {
        case "price":
          return v.price.amount;
        case "year":
          return v.year;
        case "daysInStock":
          return v.daysInStock;
        case "acquiredAt":
          return new Date(v.acquiredAt).getTime();
      }
    };
    return valueOf(a) - valueOf(b);
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

export async function getVehicles(filters?: VehicleFilters): Promise<Vehicle[]> {
  await wait();
  return applyFilters(vehicles, filters);
}

/**
 * Paginated + sorted variant of getVehicles, returning the PaginatedResult<T>
 * DTO shape a real backend list endpoint would use. Other call sites that
 * just need "every matching vehicle" (forms, the command palette, dashboard
 * widgets) keep using getVehicles — this is the shape a genuinely large,
 * server-paginated inventory list would need.
 */
export async function getVehiclesPaginated(filters?: VehicleFilters): Promise<PaginatedResult<Vehicle>> {
  await wait();
  const filtered = applyFilters(vehicles, filters);
  const sorted = applySort(filtered, filters?.sortBy, filters?.sortDirection ?? "desc");
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 8;
  const start = (page - 1) * pageSize;
  return {
    items: sorted.slice(start, start + pageSize),
    total: sorted.length,
    page,
    pageSize,
  };
}

export async function getVehicleById(id: ID): Promise<Vehicle | null> {
  await wait(200);
  return vehicles.find((v) => v.id === id) ?? null;
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  await wait();
  const vehicle: Vehicle = {
    ...input,
    id: `veh-${Math.random().toString(36).slice(2, 9)}`,
    daysInStock: 0,
    acquiredAt: new Date().toISOString().slice(0, 10),
  };
  vehicles = [vehicle, ...vehicles];
  return vehicle;
}

export async function updateVehicle(id: ID, patch: Partial<VehicleInput>): Promise<Vehicle> {
  await wait();
  const index = vehicles.findIndex((v) => v.id === id);
  if (index === -1) throw new Error("Vehicle not found");
  vehicles[index] = { ...vehicles[index], ...patch };
  return vehicles[index];
}

export async function getVehicleMakes(): Promise<string[]> {
  await wait(100);
  return Array.from(new Set(vehicles.map((v) => v.make))).sort();
}
