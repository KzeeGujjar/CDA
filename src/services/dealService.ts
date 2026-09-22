import type { ID } from "@/types/common";
import type { Deal, DealInput, DealStatus } from "@/types/deal";
import { dealsFixture } from "@/mock/deals";

let deals: Deal[] = [...dealsFixture];
const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDeals(): Promise<Deal[]> {
  await wait();
  return deals;
}

export async function getDealById(id: ID): Promise<Deal | null> {
  await wait(200);
  return deals.find((d) => d.id === id) ?? null;
}

export async function getDealsByCustomerId(customerId: ID): Promise<Deal[]> {
  await wait(150);
  return deals.filter((d) => d.customerId === customerId);
}

export async function createDeal(input: DealInput): Promise<Deal> {
  await wait();
  const subtotal = input.lineItems.reduce((sum, li) => sum + li.amount.amount, 0);
  const vatAmount = Math.round(subtotal * input.vatRate);
  const deal: Deal = {
    ...input,
    id: `deal-${Math.random().toString(36).slice(2, 9)}`,
    reference: `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    subtotal: { amount: subtotal, currency: "AED" },
    vatAmount: { amount: vatAmount, currency: "AED" },
    total: { amount: subtotal + vatAmount, currency: "AED" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  deals = [deal, ...deals];
  return deal;
}

export async function updateDealStatus(id: ID, status: DealStatus): Promise<Deal> {
  await wait();
  const index = deals.findIndex((d) => d.id === id);
  if (index === -1) throw new Error("Deal not found");
  deals[index] = { ...deals[index], status, updatedAt: new Date().toISOString() };
  return deals[index];
}
