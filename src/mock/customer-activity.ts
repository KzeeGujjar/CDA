import type { CustomerCall, CustomerDocument, CustomerMessage, CustomerNote, CustomerTask } from "@/types/customer";

const staff = ["Layla Hassan", "Yousef Karim", "Noora Al Hammadi", "Michael Chen"];

function iso(daysAgo: number, hour = 10, minute = 0): string {
  const base = new Date("2026-09-14T00:00:00Z");
  base.setUTCDate(base.getUTCDate() - daysAgo);
  base.setUTCHours(hour, minute, 0, 0);
  return base.toISOString();
}

let noteSeq = 0;
function note(customerId: string, body: string, daysAgo: number, authorName: string = staff[0]): CustomerNote {
  noteSeq += 1;
  return { id: `note-${String(noteSeq).padStart(3, "0")}`, customerId, body, authorName, createdAt: iso(daysAgo) };
}

let taskSeq = 0;
function task(
  customerId: string,
  title: string,
  daysAgo: number,
  status: CustomerTask["status"],
  assignedToName: string = staff[0],
  dueInDays?: number
): CustomerTask {
  taskSeq += 1;
  return {
    id: `ctask-${String(taskSeq).padStart(3, "0")}`,
    customerId,
    title,
    status,
    assignedToName,
    dueAt: dueInDays !== undefined ? iso(-dueInDays) : undefined,
    createdAt: iso(daysAgo),
  };
}

let docSeq = 0;
function doc(
  customerId: string,
  name: string,
  type: CustomerDocument["type"],
  sizeLabel: string,
  daysAgo: number
): CustomerDocument {
  docSeq += 1;
  return { id: `cdoc-${String(docSeq).padStart(3, "0")}`, customerId, name, type, sizeLabel, uploadedAt: iso(daysAgo) };
}

let msgSeq = 0;
function msg(
  customerId: string,
  channel: CustomerMessage["channel"],
  direction: CustomerMessage["direction"],
  body: string,
  daysAgo: number,
  hour = 10
): CustomerMessage {
  msgSeq += 1;
  return { id: `cmsg-${String(msgSeq).padStart(3, "0")}`, customerId, channel, direction, body, createdAt: iso(daysAgo, hour) };
}

let callSeq = 0;
function call(
  customerId: string,
  direction: CustomerCall["direction"],
  outcome: CustomerCall["outcome"],
  durationMinutes: number,
  daysAgo: number,
  summary?: string
): CustomerCall {
  callSeq += 1;
  return { id: `ccall-${String(callSeq).padStart(3, "0")}`, customerId, direction, outcome, durationMinutes, summary, createdAt: iso(daysAgo) };
}

export const customerNotesFixture: CustomerNote[] = [
  note("cus-001", "Prefers WhatsApp for updates; responds fastest in the evenings.", 10, "Layla Hassan"),
  note("cus-001", "Considering a part-exchange on his current G-Wagon — needs a trade-in estimate.", 3, "Layla Hassan"),
  note("cus-002", "Wants the Range Rover Sport in Santorini Black with the black pack.", 4, "Yousef Karim"),
  note("cus-003", "Buying for the family; needs financing pre-approval before committing.", 2, "Noora Al Hammadi"),
  note("cus-004", "Relocating from the UK, needs help with import/registration paperwork.", 5, "Michael Chen"),
  note("cus-005", "Repeat buyer — extremely satisfied with the LX 600 purchased last year.", 15, "Layla Hassan"),
  note("cus-006", "VIP client. Always negotiates hard but closes quickly once terms are fair.", 2, "Yousef Karim"),
  note("cus-007", "Only communicates in English; based in JBR, prefers evening test drives.", 4, "Noora Al Hammadi"),
  note("cus-008", "Evaluating a 3-vehicle fleet order for his logistics company.", 5, "Michael Chen"),
  note("cus-009", "First-time buyer in the UAE, asked for a walkthrough of the buying process.", 1, "Layla Hassan"),
  note("cus-010", "Lost to a competitor on price — reconnect in 3 months for new arrivals.", 16, "Yousef Karim"),
  note("cus-011", "Wants the LX 600 VIP with rear entertainment package.", 3, "Noora Al Hammadi"),
  note("cus-012", "Interested in the import history and accident report for the Raptor.", 3, "Michael Chen"),
  note("cus-013", "Closed at full asking price, no negotiation — extremely happy customer.", 14, "Layla Hassan"),
  note("cus-014", "Comparing hybrid range figures against a competitor's plug-in hybrid SUV.", 4, "Yousef Karim"),
  note("cus-015", "Wants complete service history documentation before finalizing.", 4, "Noora Al Hammadi"),
];

export const customerTasksFixture: CustomerTask[] = [
  task("cus-001", "Prepare trade-in valuation for the G-Wagon", 3, "open", "Layla Hassan", -2),
  task("cus-001", "Send updated VAT-inclusive quote", 8, "completed", "Layla Hassan"),
  task("cus-002", "Confirm Range Rover Sport delivery slot", 2, "open", "Yousef Karim", -1),
  task("cus-003", "Follow up on financing pre-approval status", 1, "open", "Noora Al Hammadi", -3),
  task("cus-004", "Share import & registration checklist", 4, "completed", "Michael Chen"),
  task("cus-005", "Send loyalty program invitation", 6, "open", "Layla Hassan", -5),
  task("cus-006", "Finalize trade-in offer for Bentayga", 1, "open", "Yousef Karim", 0),
  task("cus-007", "Schedule evening test drive for Model X Plaid", 3, "open", "Noora Al Hammadi", -2),
  task("cus-008", "Prepare fleet pricing proposal (3x Yukon Denali)", 4, "open", "Michael Chen", -1),
  task("cus-009", "Call to introduce buying process and financing options", 0, "open", "Layla Hassan", -1),
  task("cus-011", "Confirm rear entertainment package availability", 2, "open", "Noora Al Hammadi", -2),
  task("cus-012", "Share accident and import history report", 2, "completed", "Michael Chen"),
  task("cus-013", "Send post-sale satisfaction survey", 12, "completed", "Layla Hassan"),
  task("cus-014", "Send hybrid range comparison sheet", 3, "open", "Yousef Karim", -3),
  task("cus-015", "Attach full service history to deal file", 3, "open", "Noora Al Hammadi", -2),
];

export const customerDocumentsFixture: CustomerDocument[] = [
  doc("cus-001", "Emirates ID copy.pdf", "id", "1.2 MB", 12),
  doc("cus-001", "Driving license.pdf", "license", "0.8 MB", 12),
  doc("cus-002", "Passport copy.pdf", "id", "1.4 MB", 6),
  doc("cus-003", "Bank pre-approval letter.pdf", "other", "0.6 MB", 2),
  doc("cus-004", "UK driving license.pdf", "license", "0.9 MB", 5),
  doc("cus-005", "Sales contract - LX600.pdf", "contract", "2.1 MB", 20),
  doc("cus-005", "Invoice - LX600.pdf", "invoice", "0.5 MB", 18),
  doc("cus-006", "Emirates ID copy.pdf", "id", "1.1 MB", 8),
  doc("cus-007", "Passport copy.pdf", "id", "1.3 MB", 6),
  doc("cus-008", "Trade license - fleet order.pdf", "other", "1.8 MB", 5),
  doc("cus-011", "Emirates ID copy.pdf", "id", "1.0 MB", 5),
  doc("cus-012", "Import history report.pdf", "other", "0.7 MB", 2),
  doc("cus-013", "Sales contract - Land Cruiser GXR.pdf", "contract", "2.3 MB", 13),
  doc("cus-013", "Invoice - Land Cruiser GXR.pdf", "invoice", "0.5 MB", 12),
  doc("cus-014", "Pakistan driving license.pdf", "license", "0.8 MB", 4),
  doc("cus-015", "Service history export.pdf", "other", "1.5 MB", 3),
];

export const customerMessagesFixture: CustomerMessage[] = [
  msg("cus-001", "whatsapp", "outbound", "Hi Ahmed, here's the updated pricing for the G63 AMG with VAT included.", 12, 9),
  msg("cus-001", "whatsapp", "inbound", "Thank you, can you also check the trade-in value for my current G-Wagon?", 12, 11),
  msg("cus-001", "whatsapp", "outbound", "Sure, I'll get you a trade-in estimate by tomorrow.", 12, 11),
  msg("cus-002", "email", "outbound", "Hi Fatima, the Range Rover Sport in Santorini Black is available for viewing this week.", 5, 10),
  msg("cus-002", "whatsapp", "inbound", "Great, can we do Thursday evening around 6pm?", 4, 15),
  msg("cus-003", "email", "outbound", "Hi Rajesh, attaching the financing options for the Nissan Patrol.", 3, 10),
  msg("cus-004", "email", "outbound", "Hi Sarah, here's the checklist for importing and registering your vehicle in the UAE.", 5, 9),
  msg("cus-004", "email", "inbound", "This is very helpful, thank you! I'll get the documents ready.", 4, 14),
  msg("cus-005", "whatsapp", "outbound", "Hi Muhammad, thanks again for choosing us for your LX 600. Enjoy the drive!", 18, 10),
  msg("cus-006", "whatsapp", "inbound", "What's the best you can do on the Bentayga including my trade-in?", 2, 16),
  msg("cus-006", "whatsapp", "outbound", "Let me run the numbers and get back to you within the hour.", 2, 16),
  msg("cus-007", "email", "outbound", "Hi Elena, attaching the Model X Plaid brochure and estimated delivery timeline.", 4, 11),
  msg("cus-008", "whatsapp", "inbound", "Can you prepare a proposal for 3 Yukon Denali units for our fleet?", 5, 9),
  msg("cus-008", "whatsapp", "outbound", "Absolutely, I'll have a fleet pricing proposal ready by end of week.", 5, 9),
  msg("cus-009", "sms", "outbound", "Hi Priya, thanks for your interest in the Palisade. We'll call you shortly.", 1, 8),
  msg("cus-011", "whatsapp", "inbound", "Is the rear entertainment package available on the LX 600 VIP?", 3, 12),
  msg("cus-011", "whatsapp", "outbound", "Yes, it can be fitted — I'll confirm lead time and pricing.", 3, 13),
  msg("cus-012", "email", "outbound", "Hi James, attaching the accident and import history report for the F-150 Raptor.", 2, 10),
  msg("cus-014", "whatsapp", "inbound", "How does the Wrangler 4xe's electric range compare to the RAV4 Prime?", 4, 17),
  msg("cus-014", "whatsapp", "outbound", "Great question — sending over a side-by-side comparison sheet now.", 4, 17),
  msg("cus-015", "email", "outbound", "Hi Arjun, attaching the full service history for the Patrol Platinum.", 3, 10),
];

export const customerCallsFixture: CustomerCall[] = [
  call("cus-001", "outbound", "connected", 8, 10, "Discussed financing options and monthly installment plans."),
  call("cus-002", "outbound", "voicemail", 0, 6, "Left a voicemail about Range Rover Sport viewing availability."),
  call("cus-003", "inbound", "connected", 12, 2, "Customer asked about financing pre-approval turnaround time."),
  call("cus-004", "outbound", "connected", 15, 5, "Walked through the import and registration process step by step."),
  call("cus-005", "outbound", "connected", 5, 18, "Courtesy call after delivery — customer very satisfied."),
  call("cus-006", "inbound", "connected", 10, 13, "Discussing trade-in valuation for existing Bentayga."),
  call("cus-007", "outbound", "no_answer", 0, 5, "No answer, follow-up WhatsApp sent instead."),
  call("cus-008", "inbound", "connected", 20, 5, "Detailed discussion on fleet order requirements and timeline."),
  call("cus-009", "outbound", "connected", 6, 1, "Introduced the buying process and answered initial questions."),
  call("cus-010", "outbound", "connected", 9, 16, "Customer confirmed going with a competitor on price."),
  call("cus-011", "inbound", "connected", 11, 12, "Negotiating final price on the LX 600 VIP."),
  call("cus-012", "outbound", "connected", 7, 12, "Discussed import history and accident report findings."),
  call("cus-013", "outbound", "connected", 4, 1, "Delivery day coordination call."),
  call("cus-014", "inbound", "connected", 9, 11, "Asked detailed questions about Jeep Wrangler 4xe hybrid range."),
  call("cus-015", "outbound", "connected", 6, 11, "Requested Patrol Platinum service history."),
];
