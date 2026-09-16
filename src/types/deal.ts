import type { ID, Money } from "./common";

export type DealStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "converted_to_contract"
  | "declined";

export interface DealLineItem {
  id: ID;
  label: string;
  amount: Money;
}

export interface Deal {
  id: ID;
  reference: string;
  customerId: ID;
  customerName: string;
  vehicleId: ID;
  vehicleLabel: string;
  status: DealStatus;
  lineItems: DealLineItem[];
  vatRate: number;
  subtotal: Money;
  vatAmount: Money;
  total: Money;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export type DealInput = Omit<
  Deal,
  "id" | "reference" | "createdAt" | "updatedAt" | "subtotal" | "vatAmount" | "total"
>;
