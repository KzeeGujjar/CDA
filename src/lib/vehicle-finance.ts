import type { Vehicle } from "@/types/vehicle";

export function getTotalCost(vehicle: Vehicle): number {
  return vehicle.costPrice.amount + vehicle.repairCost.amount + vehicle.transportCost.amount;
}

export function getExpectedProfit(vehicle: Vehicle): number {
  return vehicle.expectedSellingPrice.amount - getTotalCost(vehicle);
}

export function getProfitMarginPct(vehicle: Vehicle): number {
  const totalCost = getTotalCost(vehicle);
  if (totalCost === 0) return 0;
  return (getExpectedProfit(vehicle) / totalCost) * 100;
}
