import type { ChatThread } from "@/types/conversation";
import { dealershipInfo } from "@/lib/dealership-info";

export const chatThreadsFixture: ChatThread[] = [
  {
    id: "thread-001",
    title: "Aging inventory review",
    lastMessagePreview: "Here are your top 3 aging vehicles...",
    updatedAt: "2026-09-13T08:20:00Z",
    messages: [
      { id: "m1", role: "user", content: "What's my top aging inventory?", createdAt: "2026-09-13T08:19:00Z" },
      {
        id: "m2",
        role: "assistant",
        content:
          "Here are your top 3 aging vehicles: the Mitsubishi Pajero GLS (73 days), Ford F-150 Raptor (67 days), and Jeep Wrangler Rubicon 4xe (52 days). Consider a targeted price adjustment or a bundled trade-in offer to move the Pajero — it's been under service longer than average too.",
        createdAt: "2026-09-13T08:20:00Z",
      },
    ],
  },
  {
    id: "thread-002",
    title: "Lead summary — Sep 13",
    lastMessagePreview: "You have 3 leads in negotiation...",
    updatedAt: "2026-09-13T07:05:00Z",
    messages: [
      { id: "m3", role: "user", content: "Summarize today's leads", createdAt: "2026-09-13T07:04:00Z" },
      {
        id: "m4",
        role: "assistant",
        content:
          "You have 3 leads in negotiation worth a combined AED 2.6M: Ahmed Al Mazrouei (G63 AMG), Omar Al Falasi (Bentayga), and Mariam Al Zaabi (LX 600). Omar's follow-up is due today at 11:00 AM — he's discussing a trade-in valuation.",
        createdAt: "2026-09-13T07:05:00Z",
      },
    ],
  },
];

interface CannedRule {
  keywords: string[];
  response: string;
}

const cannedRules: CannedRule[] = [
  {
    keywords: ["summarize", "today", "leads"],
    response:
      "You have 3 leads in negotiation worth a combined AED 2.6M, 4 leads qualified this week, and 2 follow-ups due before 4 PM today. Would you like me to draft reminders for the assigned sales reps?",
  },
  {
    keywords: ["follow-up", "followup", "whatsapp", "draft"],
    response:
      "Here's a draft: \"Hi {name}, following up on the vehicle you viewed — we can offer a same-week delivery and a complimentary extended warranty if you'd like to move forward this week. Let me know a good time to finalize the paperwork.\"",
  },
  {
    keywords: ["aging", "oldest", "longest"],
    response:
      "Your longest-standing inventory: Mitsubishi Pajero GLS (73 days, under service), Ford F-150 Raptor (67 days), and Jeep Wrangler Rubicon 4xe (52 days, already sold — pending handover). I'd recommend a 5-8% price adjustment on the Pajero once service is complete.",
  },
  {
    keywords: ["price", "pricing", "trade-in", "trade in"],
    response:
      "Based on comparable UAE listings and current mileage, I'd position this trade-in within 3-5% of market average — high enough to protect margin, low enough to move within 30 days. Want me to run a full valuation?",
  },
  {
    keywords: [
      "bank financing",
      "bank finance",
      "financing evaluation",
      "bank valuation",
      "loan valuation",
      "finance evaluation",
      "mortgage valuation",
      "adib",
      "adcb",
      "enbd",
      "dib",
      "eib",
      "fab",
      "al hilal",
      "mashreq",
    ],
    response:
      "We can prepare an official bank-financing valuation report for ADIB, ADCB, Emirates Islamic (EIB), Emirates NBD (ENBD), Dubai Islamic Bank (DIB), FAB, Al Hilal Bank, and Mashreq Bank. Each evaluation costs AED 300 per vehicle. You can submit a request from the Vehicle Valuation page under \"Bank Financing Evaluation.\"",
  },
  {
    keywords: ["valuation", "value", "worth"],
    response:
      "I can pull a market valuation for you — head to Vehicle Valuation and enter the make, model, year, and mileage, and I'll estimate a value range with comparable listings.",
  },
  {
    keywords: ["location", "address", "where are you", "directions", "showroom", "visit you", "how do i get"],
    response: `We're located at ${dealershipInfo.nameEn} | ${dealershipInfo.nameAr}, ${dealershipInfo.address}. Let me know if you'd like directions or to book a showroom visit.`,
  },
];

const fallbackResponses = [
  "I've noted that — once connected to live dealership data, I'll be able to act on this directly. For now, here's what I can tell you from your current inventory and leads.",
  "Good question. Based on your current dashboard data, I'd recommend checking the Leads and Inventory modules for the most relevant details, and I can help you draft next steps.",
];

export function getCannedResponse(prompt: string): string {
  const lower = prompt.toLowerCase();
  for (const rule of cannedRules) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return rule.response;
    }
  }
  return fallbackResponses[prompt.length % fallbackResponses.length];
}

const marketplaceKeywords = [
  "dubizzle",
  "yallamotor",
  "yalla motor",
  "marketplace inventory",
  "marketplace listings",
  "connected marketplace",
];

export function isMarketplaceInventoryRequest(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return marketplaceKeywords.some((k) => lower.includes(k));
}

export function buildMarketplaceReply(listingCount: number): string {
  if (listingCount === 0) {
    return "I couldn't find any matching listings on Dubizzle or YallaMotor right now. Want me to broaden the search?";
  }
  return `I found ${listingCount} live listing${listingCount === 1 ? "" : "s"} across Dubizzle and YallaMotor that match — here's what's currently available:`;
}
