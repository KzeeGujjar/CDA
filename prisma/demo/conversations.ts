/**
 * Demo AI conversations. The answers are built from the demo records, so every figure quoted in them (days in
 * stock, margins, pipeline counts) is true for the data that was just seeded.
 *
 * They are canned text, not model output: the seed stores no provider or model on them and writes no usage
 * ledger rows, so nothing pretends a real model was called or that any money was spent.
 */
import { deals, leads, users, vehicles, type UserKey, type VehicleKey } from "./data";
import { aed, budgetOf, costOf, expectedPriceOf, marketValueOf, salePriceOf, vatOf, vehicleName } from "./derive";

export interface ConversationRow {
  user: UserKey;
  title: string;
  /** at most one record (a database rule) */
  context?: { vehicle?: VehicleKey; lead?: string; deal?: string };
  /** [days ago, hour of day in Dubai time] the conversation started */
  startedAt: [number, number];
  messages: { role: "USER" | "ASSISTANT"; content: string }[];
}

const vehicle = (key: VehicleKey) => {
  const v = vehicles.find((x) => x.key === key);
  if (!v) throw new Error(`unknown vehicle ${key}`);
  return v;
};
const firstName = (key: UserKey) => users.find((u) => u.key === key)!.name.split(" ")[0];
const pct = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

export function buildConversations(): ConversationRow[] {
  // ── Aging inventory ──
  const unsold = vehicles.filter((v) => v.status !== "SOLD");
  const aging = [...unsold].sort((a, b) => b.acq - a.acq).slice(0, 3);
  const worst = aging[0];
  const worstCost = costOf(worst);
  const statusWords = (s: string) => (s === "UNDER_REPAIR" ? "under repair" : s.toLowerCase().replace(/_/g, " "));
  const agingLines = aging
    .map(
      (v, i) =>
        `${i + 1}) ${vehicleName(v)}: ${v.acq} days in stock, ${statusWords(v.status)}, listed at ${aed(v.list)}.`
    )
    .join("\n");

  // ── Pipeline ──
  const open = leads.filter((l) => l.stage !== "WON" && l.stage !== "LOST");
  const count = (stage: string) => leads.filter((l) => l.stage === stage).length;
  const negotiation = leads.filter((l) => l.stage === "NEGOTIATION");
  const negotiationValue = negotiation.reduce((sum, l) => sum + budgetOf(vehicle(l.vehicle), l.bf), 0);
  const today = open.filter((l) => l.next?.[0] === 0).length;
  const overdue = open.filter((l) => l.next !== null && l.next[0] < 0);
  const customerName = (l: { customer: string }) => l.customer.charAt(0).toUpperCase() + l.customer.slice(1);

  // ── The G63 follow-up ──
  const g63 = vehicle("g63");
  const g63Lead = leads.find((l) => l.key === "l18")!;
  const g63Deal = deals.find((d) => d.key === "d10")!;
  const g63Price = salePriceOf(g63, g63Deal.factor);

  // ── Land Cruiser price check ──
  const lc = vehicle("lc300");
  const lcCost = costOf(lc);
  const lcGap = marketValueOf(lc) - lc.list;

  // ── Range Rover Sport quotation ──
  const rr = vehicle("rrs");
  const rrDeal = deals.find((d) => d.key === "d14")!;
  const rrPrice = salePriceOf(rr, rrDeal.factor);
  const rrCost = costOf(rr);

  // ── Inventory counts (Arabic summary) ──
  const n = (status: string) => unsold.filter((v) => v.status === status).length;
  const inWorkshop = n("UNDER_REPAIR") + n("UNDER_INSPECTION");

  const overdueLine = overdue.length
    ? overdue
        .map((l) => {
          const v = vehicle(l.vehicle);
          return `${customerName(l)} (${v.make} ${v.model}, assigned to ${firstName(l.sales)}): the follow-up was due yesterday.`;
        })
        .join("\n")
    : "Nobody is overdue.";

  return [
    {
      user: "owner",
      title: "Aging inventory review",
      startedAt: [2, 9],
      messages: [
        { role: "USER", content: "Which vehicles have been in stock the longest?" },
        {
          role: "ASSISTANT",
          content: `The three longest-standing vehicles are:\n${agingLines}\n\nThe ${worst.make} ${worst.model} is the biggest concern: it has cost ${aed(worstCost)} so far against a list price of ${aed(worst.list)}, which leaves ${aed(worst.list - worstCost)} of margin before it is sold.`,
        },
        { role: "USER", content: `What should we do with the ${worst.model}?` },
        {
          role: "ASSISTANT",
          content: `Finish the repair first, then price it to move. At the current market estimate of ${aed(marketValueOf(worst))} the margin would be about ${aed(marketValueOf(worst) - worstCost)}. If the repair cost grows any further, consider selling it to another dealer rather than holding it longer.`,
        },
      ],
    },
    {
      user: "manager",
      title: "Pipeline summary",
      startedAt: [1, 8],
      messages: [
        { role: "USER", content: "Summarize the pipeline for me." },
        {
          role: "ASSISTANT",
          content: `There are ${open.length} open leads: ${count("NEW")} new, ${count("CONTACTED")} contacted, ${count("QUALIFIED")} qualified, ${count("VIEWING")} viewing and ${count("NEGOTIATION")} in negotiation. The ${negotiation.length} in negotiation are worth about ${aed(negotiationValue)} in vehicles: ${negotiation.map((l) => `${customerName(l)} (${vehicle(l.vehicle).make} ${vehicle(l.vehicle).model})`).join(", ")}. ${today} follow-ups are due today and ${overdue.length} ${overdue.length === 1 ? "is" : "are"} overdue.`,
        },
        { role: "USER", content: "Who is overdue?" },
        { role: "ASSISTANT", content: overdueLine },
      ],
    },
    {
      user: "sales1",
      title: "Follow-up message for Ahmed",
      context: { lead: g63Lead.key },
      startedAt: [2, 9],
      messages: [
        { role: "USER", content: "Draft a WhatsApp follow-up for Ahmed about the G63." },
        {
          role: "ASSISTANT",
          content: `Here is a draft:\n\n"Hi Ahmed, this is ${firstName("sales1")} from Desert Falcon Motors. I've updated the ${g63.model} ${g63.trim} quotation with the 3-year service package and added two financing options for you to compare. Would tomorrow morning work to go through them together? The vehicle is currently reserved for you."\n\nNothing has been sent. Review it and send it yourself when you are ready.`,
        },
        { role: "USER", content: "Make it shorter and add the price." },
        {
          role: "ASSISTANT",
          content: `"Hi Ahmed, ${firstName("sales1")} here. The ${g63.model} ${g63.trim} is ${aed(g63Price)} excluding 5% VAT, with the 3-year service package included. Shall we go through the financing options tomorrow morning?"`,
        },
      ],
    },
    {
      user: "sales2",
      title: "Price check: Land Cruiser GXR",
      context: { vehicle: lc.key },
      startedAt: [3, 11],
      messages: [
        { role: "USER", content: "Is the Land Cruiser GXR priced right?" },
        {
          role: "ASSISTANT",
          content: `It is listed at ${aed(lc.list)} and the estimated market value is ${aed(marketValueOf(lc))}, so it sits ${aed(Math.abs(lcGap))} (${pct(Math.abs(lcGap), marketValueOf(lc))}) ${lcGap >= 0 ? "below" : "above"} the market. Your cost is ${aed(lcCost)}, so the margin at the list price is ${aed(lc.list - lcCost)} (${pct(lc.list - lcCost, lc.list)}). The expected selling price of ${aed(expectedPriceOf(lc))} would still leave ${aed(expectedPriceOf(lc) - lcCost)}.`,
        },
        { role: "USER", content: "So there is room to hold the price?" },
        {
          role: "ASSISTANT",
          content: `Yes. It is a new GCC-specification vehicle priced ${lcGap >= 0 ? "below" : "above"} the market and it has been in stock for only ${lc.acq} days. I would hold the price and only negotiate on extras such as the service package.`,
        },
      ],
    },
    {
      user: "owner",
      title: "Margin on the Range Rover Sport quotation",
      context: { deal: rrDeal.key },
      startedAt: [1, 15],
      messages: [
        { role: "USER", content: "What is our margin on the Range Rover Sport quotation?" },
        {
          role: "ASSISTANT",
          content: `The draft quotation is ${aed(rrPrice)} before VAT (${aed(vatOf(rrPrice))} of 5% VAT on top). The vehicle cost ${aed(rrCost)} including transport, so the margin is ${aed(rrPrice - rrCost)}, or ${pct(rrPrice - rrCost, rrPrice)} of the sale price. It is a draft, so nothing has been sent to the customer.`,
        },
      ],
    },
    {
      user: "marketing",
      title: "ملخص المخزون الأسبوعي",
      startedAt: [1, 10],
      messages: [
        { role: "USER", content: "لخّص لي حالة المخزون هذا الأسبوع." },
        {
          role: "ASSISTANT",
          content: `لدينا ${unsold.length} مركبة في المخزون: ${n("AVAILABLE")} متاحة للبيع، ${n("RESERVED")} محجوزة، ${n("IN_TRANSIT")} قيد الشحن، و${inWorkshop} في الفحص أو الإصلاح. أقدم مركبة هي ${worst.make} ${worst.model} (${worst.acq} يومًا في المخزون).`,
        },
      ],
    },
  ];
}
