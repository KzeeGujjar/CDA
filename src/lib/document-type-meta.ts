import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, FileCheck2, FileSignature, FileSpreadsheet, FileText, Receipt, Truck } from "lucide-react";
import type { DocumentType } from "@/types/document";

export const documentTypeMeta: Record<DocumentType, { icon: LucideIcon; labelKey: string }> = {
  purchase_agreement: { icon: FileSignature, labelKey: "purchaseAgreement" },
  sales_agreement: { icon: FileCheck2, labelKey: "salesAgreement" },
  quotation: { icon: FileSpreadsheet, labelKey: "quotation" },
  invoice: { icon: Receipt, labelKey: "invoice" },
  receipt: { icon: Receipt, labelKey: "receipt" },
  inspection_report: { icon: ClipboardCheck, labelKey: "inspectionReport" },
  delivery_form: { icon: Truck, labelKey: "deliveryForm" },
  customer_agreement: { icon: FileText, labelKey: "customerAgreement" },
};

export const documentTypes: DocumentType[] = [
  "purchase_agreement",
  "sales_agreement",
  "quotation",
  "invoice",
  "receipt",
  "inspection_report",
  "delivery_form",
  "customer_agreement",
];
