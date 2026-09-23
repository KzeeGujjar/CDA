import type { DocumentType } from "@/generated/prisma/client";

/**
 * The built-in English wording used when an organization has not created its own template for a type yet
 * (documents.service.ts's getActiveTemplate falls back to these — no row is written for them). A dealership
 * that wants its own wording, a different language, or different clauses creates a template of its own
 * (POST /api/v1/document-templates), which becomes version 1 and is used from then on; these defaults are
 * never edited in place.
 */
export const DEFAULT_TEMPLATES: Record<DocumentType, string> = {
  PURCHASE_AGREEMENT: `VEHICLE PURCHASE AGREEMENT

Date: {{date}}
Dealer: {{dealer.line}}
Seller (Customer): {{customer.line}}

Vehicle: {{vehicle.line}}
Agreed purchase price: {{price}}

The dealer agrees to purchase the above vehicle from the seller subject to inspection and verification of ownership documents. Payment will be issued upon successful transfer of title and completion of due diligence.

Signatures:
Dealer representative: ______________________
Seller: ______________________`,

  SALES_AGREEMENT: `VEHICLE SALES AGREEMENT

Date: {{date}}
Dealer: {{dealer.line}}
Buyer: {{customer.line}}

Vehicle: {{vehicle.line}}
Sale price: {{price}}

The dealer agrees to sell, and the buyer agrees to purchase, the above vehicle in its current condition, inspected and disclosed as per the attached inspection report. Ownership transfers upon full payment and registration.

Signatures:
Dealer representative: ______________________
Buyer: ______________________`,

  QUOTATION: `QUOTATION

Date: {{date}}
Prepared for: {{customer.line}}
Dealer: {{dealer.line}}

Vehicle: {{vehicle.line}}
Quoted price: {{price}}
VAT (5%): {{vat}}

This quotation is valid for 7 days from the date of issue and is subject to vehicle availability.`,

  INVOICE: `TAX INVOICE

Date: {{date}}
Billed to: {{customer.line}}
Dealer: {{dealer.line}}
{{dealer.taxLine}}

Description: {{vehicle.line}}
Amount due: {{price}}
VAT (5%): {{vat}}

Payment terms: Due upon receipt. Thank you for your business.`,

  RECEIPT: `PAYMENT RECEIPT

Date: {{date}}
Received from: {{customer.line}}
Dealer: {{dealer.line}}

For: {{vehicle.line}}
Amount received: {{price}}
Payment method: [To be specified]

This receipt confirms payment received in full.`,

  INSPECTION_REPORT: `VEHICLE INSPECTION REPORT

Date: {{date}}
Inspector: {{dealer.line}}
Vehicle: {{vehicle.line}}

Exterior: [To be completed by inspector]
Interior: [To be completed by inspector]
Engine & mechanical: [To be completed by inspector]
Accident history: {{vehicle.accidentHistory}}
Service history: {{vehicle.serviceHistory}}
Mileage: {{vehicle.mileageLine}}

Overall condition: [To be completed by inspector]`,

  DELIVERY_FORM: `VEHICLE DELIVERY FORM

Date: {{date}}
Delivered to: {{customer.line}}
Dealer: {{dealer.line}}

Vehicle: {{vehicle.line}}

Items delivered:
☐ Vehicle keys (2 sets)
☐ Registration card
☐ Service booklet
☐ Owner's manual
☐ Warranty documents

Customer acknowledges receipt of the vehicle in the condition described above.

Signatures:
Dealer representative: ______________________
Customer: ______________________`,

  CUSTOMER_AGREEMENT: `CUSTOMER AGREEMENT

Date: {{date}}
Customer: {{customer.line}}
Dealer: {{dealer.line}}

This agreement outlines the terms of service between the customer and {{dealer.line}} regarding the purchase, financing, or servicing of the vehicle: {{vehicle.line}}.

By signing below, the customer acknowledges having read and agreed to the dealer's terms and conditions.

Signatures:
Dealer representative: ______________________
Customer: ______________________`,
};
