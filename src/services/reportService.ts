import type {
  AiPerformanceReport,
  InventoryReport,
  LeadReport,
  MarketReport,
  ProfitReport,
  PurchaseReport,
  SalesReport,
  SalespersonPerformanceReport,
  VehiclePerformanceReport,
} from "@/types/report";
import {
  aiPerformanceReportFixture,
  inventoryReportFixture,
  leadReportFixture,
  marketReportFixture,
  profitReportFixture,
  purchaseReportFixture,
  salesReportFixture,
  salespersonPerformanceReportFixture,
  vehiclePerformanceReportFixture,
} from "@/mock/reports";
import { backendRequest, liveOrDemo, unwrapBackend } from "@/services/backend";

/**
 * Reporting APIs (§0.20). Connected to /api/v1/reports/*: with a real session, every report is computed live
 * from the same tables the rest of the app writes (deals, vehicles, leads, AI usage) — the response shapes
 * already match these types field-for-field, so no mapping layer is needed here, only the demo/live switch.
 * "Market" has no real data anywhere in this app (no external market-data integration exists) and stays on
 * its demo data in both modes, exactly like Deals/Tasks did before their own modules existed.
 */
const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

async function demoSalesReport(): Promise<SalesReport> {
  await wait();
  return salesReportFixture;
}
async function demoPurchaseReport(): Promise<PurchaseReport> {
  await wait();
  return purchaseReportFixture;
}
async function demoProfitReport(): Promise<ProfitReport> {
  await wait();
  return profitReportFixture;
}
async function demoInventoryReport(): Promise<InventoryReport> {
  await wait();
  return inventoryReportFixture;
}
async function demoLeadReport(): Promise<LeadReport> {
  await wait();
  return leadReportFixture;
}
async function demoSalespersonPerformanceReport(): Promise<SalespersonPerformanceReport> {
  await wait();
  return salespersonPerformanceReportFixture;
}
async function demoVehiclePerformanceReport(): Promise<VehiclePerformanceReport> {
  await wait();
  return vehiclePerformanceReportFixture;
}
async function demoAiPerformanceReport(): Promise<AiPerformanceReport> {
  await wait();
  return aiPerformanceReportFixture;
}

async function liveReport<T>(path: string): Promise<T> {
  return unwrapBackend(await backendRequest<T>("GET", path));
}

export function getSalesReport(): Promise<SalesReport> {
  return liveOrDemo({ live: () => liveReport("/reports/sales"), demo: demoSalesReport });
}
export function getPurchaseReport(): Promise<PurchaseReport> {
  return liveOrDemo({ live: () => liveReport("/reports/purchases"), demo: demoPurchaseReport });
}
export function getProfitReport(): Promise<ProfitReport> {
  return liveOrDemo({ live: () => liveReport("/reports/profit"), demo: demoProfitReport });
}
export function getInventoryReport(): Promise<InventoryReport> {
  return liveOrDemo({ live: () => liveReport("/reports/inventory"), demo: demoInventoryReport });
}
export function getLeadReport(): Promise<LeadReport> {
  return liveOrDemo({ live: () => liveReport("/reports/leads"), demo: demoLeadReport });
}
export function getSalespersonPerformanceReport(): Promise<SalespersonPerformanceReport> {
  return liveOrDemo({
    live: () => liveReport("/reports/salesperson-performance"),
    demo: demoSalespersonPerformanceReport,
  });
}
export function getVehiclePerformanceReport(): Promise<VehiclePerformanceReport> {
  return liveOrDemo({ live: () => liveReport("/reports/vehicle-performance"), demo: demoVehiclePerformanceReport });
}
/** No live counterpart: see the module comment above. */
export async function getMarketReport(): Promise<MarketReport> {
  await wait();
  return marketReportFixture;
}
export function getAiPerformanceReport(): Promise<AiPerformanceReport> {
  return liveOrDemo({ live: () => liveReport("/reports/ai-performance"), demo: demoAiPerformanceReport });
}
