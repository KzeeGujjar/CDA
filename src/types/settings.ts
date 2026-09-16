import type { ID } from "./common";
import type { RoleKey } from "@/lib/settings-roles";

export type InvoiceStatus = "paid" | "due" | "overdue";

export interface Invoice {
  id: ID;
  date: string;
  amount: number;
  status: InvoiceStatus;
}

export interface SecuritySession {
  id: ID;
  device: string;
  location: string;
  current: boolean;
}

export interface ApiKey {
  id: ID;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
}

export type DealershipUserStatus = "active" | "invited";

export interface DealershipUser {
  id: ID;
  name: string;
  email: string;
  role: RoleKey;
  status: DealershipUserStatus;
}

export interface DealershipUserInput {
  name: string;
  email: string;
  role: RoleKey;
}
