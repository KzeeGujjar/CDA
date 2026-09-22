import type { Vehicle } from "@/types/vehicle";

/**
 * These return `null` (never a computed 0) when the signed-in role does not hold profit:read, so a vehicle
 * fetched from the live API omits cost fields. Every caller must handle `null` — show a placeholder ("—" /
 * "Restricted"), never fall back to zero, which would look like a real, free vehicle.
 */
function costsVisible(vehicle: Vehicle): vehicle is Vehicle & {
  costPrice: NonNullable<Vehicle["costPrice"]>;
  repairCost: NonNullable<Vehicle["repairCost"]>;
  transportCost: NonNullable<Vehicle["transportCost"]>;
} {
  return vehicle.costPrice !== undefined && vehicle.repairCost !== undefined && vehicle.transportCost !== undefined;
}

export function getTotalCost(vehicle: Vehicle): number | null {
  if (!costsVisible(vehicle)) return null;
  return vehicle.costPrice.amount + vehicle.repairCost.amount + (vehicle.transportCost?.amount ?? 0);
}

export function getExpectedProfit(vehicle: Vehicle): number | null {
  const totalCost = getTotalCost(vehicle);
  if (totalCost === null) return null;
  return vehicle.expectedSellingPrice.amount - totalCost;
}

export function getProfitMarginPct(vehicle: Vehicle): number | null {
  const totalCost = getTotalCost(vehicle);
  if (totalCost === null) return null;
  if (totalCost === 0) return 0;
  const expectedProfit = getExpectedProfit(vehicle);
  return expectedProfit === null ? null : (expectedProfit / totalCost) * 100;
}
