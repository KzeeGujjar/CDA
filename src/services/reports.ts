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

const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getSalesReport(): Promise<SalesReport> {
  await wait();
  return salesReportFixture;
}

export async function getPurchaseReport(): Promise<PurchaseReport> {
  await wait();
  return purchaseReportFixture;
}

export async function getProfitReport(): Promise<ProfitReport> {
  await wait();
  return profitReportFixture;
}

export async function getInventoryReport(): Promise<InventoryReport> {
  await wait();
  return inventoryReportFixture;
}

export async function getLeadReport(): Promise<LeadReport> {
  await wait();
  return leadReportFixture;
}

export async function getSalespersonPerformanceReport(): Promise<SalespersonPerformanceReport> {
  await wait();
  return salespersonPerformanceReportFixture;
}

export async function getVehiclePerformanceReport(): Promise<VehiclePerformanceReport> {
  await wait();
  return vehiclePerformanceReportFixture;
}

export async function getMarketReport(): Promise<MarketReport> {
  await wait();
  return marketReportFixture;
}

export async function getAiPerformanceReport(): Promise<AiPerformanceReport> {
  await wait();
  return aiPerformanceReportFixture;
}
