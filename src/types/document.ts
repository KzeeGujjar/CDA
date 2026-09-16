import type { ID } from "./common";

export type DocumentType =
  | "purchase_agreement"
  | "sales_agreement"
  | "quotation"
  | "invoice"
  | "receipt"
  | "inspection_report"
  | "delivery_form"
  | "customer_agreement";

export type DocumentStatus = "draft" | "pending_signature" | "signed" | "completed";

export interface ContractDocument {
  id: ID;
  type: DocumentType;
  title: string;
  vehicleId?: ID;
  vehicleLabel?: string;
  customerId?: ID;
  customerName?: string;
  status: DocumentStatus;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentInput = Pick<
  ContractDocument,
  "type" | "title" | "vehicleId" | "vehicleLabel" | "customerId" | "customerName" | "createdByName"
>;

export interface DocumentFilters {
  search?: string;
  type?: DocumentType;
}
