import { generateDocumentContent, generateDocumentContentArabic } from "./document-generator";
import type { Customer } from "@/types/customer";
import type { DocumentType } from "@/types/document";
import type { Vehicle } from "@/types/vehicle";

export interface DocumentAssistantResult {
  reply: string;
  documentTitle?: string;
  documentContent?: string;
  documentType?: DocumentType;
}

export interface DocumentAssistantContext {
  vehicle?: Vehicle;
  customer?: Customer;
  lastDocument?: { title: string; content: string; type: DocumentType };
}

function detectDocumentType(prompt: string): DocumentType | null {
  if (prompt.includes("purchase agreement")) return "purchase_agreement";
  if (prompt.includes("sales agreement") || prompt.includes("sale agreement")) return "sales_agreement";
  if (prompt.includes("quotation") || prompt.includes("quote")) return "quotation";
  if (prompt.includes("invoice")) return "invoice";
  if (prompt.includes("receipt")) return "receipt";
  if (prompt.includes("inspection")) return "inspection_report";
  if (prompt.includes("delivery")) return "delivery_form";
  if (prompt.includes("customer agreement")) return "customer_agreement";
  return null;
}

function typeLabel(type: DocumentType): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function summarize(content: string): string {
  const lines = content.split("\n").filter(Boolean);
  return lines.slice(0, 6).map((line) => `• ${line.trim()}`).join("\n");
}

export function getDocumentAssistantResponse(prompt: string, context: DocumentAssistantContext): DocumentAssistantResult {
  const q = prompt.toLowerCase();

  if (q.includes("missing")) {
    const missing: string[] = [];
    if (!context.customer) missing.push("customer contact details");
    if (!context.vehicle) missing.push("vehicle details");
    else if (!context.vehicle.spec.vin) missing.push("VIN");
    const reply =
      missing.length > 0
        ? `I found ${missing.length} missing item(s): ${missing.join(", ")}. Please provide these before finalizing the document.`
        : "All required fields look complete — vehicle, customer, and pricing details are present.";
    return { reply };
  }

  if (q.includes("summari")) {
    const source = context.lastDocument ?? {
      title: typeLabel("inspection_report"),
      type: "inspection_report" as DocumentType,
      content: generateDocumentContent("inspection_report", { vehicle: context.vehicle, customer: context.customer }),
    };
    return {
      reply: `Here's a summary of "${source.title}":`,
      documentTitle: `Summary — ${source.title}`,
      documentContent: summarize(source.content),
      documentType: source.type,
    };
  }

  if (q.includes("translate") && q.includes("arabic")) {
    const source = context.lastDocument ?? {
      title: typeLabel("purchase_agreement"),
      type: "purchase_agreement" as DocumentType,
    };
    return {
      reply: `Here's the Arabic translation of "${source.title}":`,
      documentTitle: `${source.title} (Arabic)`,
      documentContent: generateDocumentContentArabic(source.type, { vehicle: context.vehicle, customer: context.customer }),
      documentType: source.type,
    };
  }

  const type = detectDocumentType(q);
  if (type) {
    return {
      reply: `Here's a draft ${typeLabel(type)} based on the selected vehicle and customer.`,
      documentTitle: typeLabel(type),
      documentContent: generateDocumentContent(type, { vehicle: context.vehicle, customer: context.customer }),
      documentType: type,
    };
  }

  return {
    reply:
      "I can create agreements, quotations, invoices, and inspection reports, summarize existing documents, translate them to Arabic, or check for missing information. Try one of the suggested prompts below.",
  };
}
