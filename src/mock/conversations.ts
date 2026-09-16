import type { Conversation, ConversationMessage, MessageChannel } from "@/types/message";
import { customersFixture } from "./customers";

function avatar(seed: string) {
  return `https://i.pravatar.cc/150?u=${seed}`;
}

function iso(daysAgo: number, hour = 10, minute = 0): string {
  const base = new Date("2026-09-14T00:00:00Z");
  base.setUTCDate(base.getUTCDate() - daysAgo);
  base.setUTCHours(hour, minute, 0, 0);
  return base.toISOString();
}

interface ConversationSeed {
  id: string;
  channel: MessageChannel;
  contactName: string;
  contactAvatarUrl?: string;
  customerId?: string;
  unreadCount: number;
  messages: { direction: "inbound" | "outbound"; body: string; daysAgo: number; hour?: number }[];
}

function customer(id: string) {
  return customersFixture.find((c) => c.id === id)!;
}

const seeds: ConversationSeed[] = [
  {
    id: "conv-001", channel: "whatsapp", contactName: customer("cus-001").name, contactAvatarUrl: customer("cus-001").avatarUrl,
    customerId: "cus-001", unreadCount: 0,
    messages: [
      { direction: "outbound", body: "Hi Ahmed, here's the updated pricing for the G63 AMG with VAT included.", daysAgo: 12, hour: 9 },
      { direction: "inbound", body: "Thank you, can you also check the trade-in value for my current G-Wagon?", daysAgo: 12, hour: 11 },
      { direction: "outbound", body: "Sure, I'll get you a trade-in estimate by tomorrow.", daysAgo: 12, hour: 11 },
    ],
  },
  {
    id: "conv-002", channel: "whatsapp", contactName: customer("cus-006").name, contactAvatarUrl: customer("cus-006").avatarUrl,
    customerId: "cus-006", unreadCount: 2,
    messages: [
      { direction: "outbound", body: "Hi Omar, following up on the Bentayga trade-in valuation.", daysAgo: 2, hour: 9 },
      { direction: "inbound", body: "What's the best you can do including my trade-in?", daysAgo: 1, hour: 16 },
      { direction: "inbound", body: "Also, is the EWB Azure still in stock?", daysAgo: 0, hour: 9 },
    ],
  },
  {
    id: "conv-003", channel: "email", contactName: customer("cus-002").name, contactAvatarUrl: customer("cus-002").avatarUrl,
    customerId: "cus-002", unreadCount: 0,
    messages: [
      { direction: "outbound", body: "Hi Fatima, the Range Rover Sport in Santorini Black is available for viewing this week.", daysAgo: 5, hour: 10 },
      { direction: "inbound", body: "Great, can we do Thursday evening around 6pm?", daysAgo: 4, hour: 15 },
      { direction: "outbound", body: "Thursday 6pm works — see you at the showroom.", daysAgo: 4, hour: 16 },
    ],
  },
  {
    id: "conv-004", channel: "email", contactName: customer("cus-004").name, contactAvatarUrl: customer("cus-004").avatarUrl,
    customerId: "cus-004", unreadCount: 1,
    messages: [
      { direction: "outbound", body: "Hi Sarah, here's the checklist for importing and registering your vehicle in the UAE.", daysAgo: 5, hour: 9 },
      { direction: "inbound", body: "This is very helpful, thank you! One more question — how long does registration typically take?", daysAgo: 0, hour: 8 },
    ],
  },
  {
    id: "conv-005", channel: "sms", contactName: customer("cus-009").name, contactAvatarUrl: customer("cus-009").avatarUrl,
    customerId: "cus-009", unreadCount: 0,
    messages: [
      { direction: "outbound", body: "Hi Priya, thanks for your interest in the Palisade. We'll call you shortly.", daysAgo: 1, hour: 8 },
      { direction: "inbound", body: "Sounds good, I'm free after 4pm today.", daysAgo: 1, hour: 8 },
    ],
  },
  {
    id: "conv-006", channel: "sms", contactName: customer("cus-014").name, contactAvatarUrl: customer("cus-014").avatarUrl,
    customerId: "cus-014", unreadCount: 1,
    messages: [
      { direction: "outbound", body: "Hi Zainab, sending over the Wrangler 4xe hybrid range comparison as promised.", daysAgo: 4, hour: 17 },
      { direction: "inbound", body: "Got it, thank you! Can we schedule a test drive this weekend?", daysAgo: 0, hour: 11 },
    ],
  },
  {
    id: "conv-007", channel: "website_chat", contactName: "Website Visitor", unreadCount: 1,
    messages: [
      { direction: "inbound", body: "Hi, do you have any SUVs under AED 150,000 in stock?", daysAgo: 0, hour: 13 },
      { direction: "outbound", body: "Hi! Yes, we have a few options — could you tell me your preferred brand or seating capacity?", daysAgo: 0, hour: 13 },
      { direction: "inbound", body: "Ideally a 7-seater, Japanese or Korean brand.", daysAgo: 0, hour: 14 },
    ],
  },
  {
    id: "conv-008", channel: "website_chat", contactName: "Website Visitor", unreadCount: 0,
    messages: [
      { direction: "inbound", body: "Do you offer financing for used vehicles?", daysAgo: 3, hour: 12 },
      { direction: "outbound", body: "Yes, we work with several banks for used vehicle financing. Would you like a callback?", daysAgo: 3, hour: 12 },
      { direction: "inbound", body: "Yes please, my number is +971 55 900 1122.", daysAgo: 3, hour: 12 },
    ],
  },
  {
    id: "conv-009", channel: "ai_agent", contactName: customer("cus-003").name, contactAvatarUrl: customer("cus-003").avatarUrl,
    customerId: "cus-003", unreadCount: 0,
    messages: [
      { direction: "inbound", body: "What's the mileage and price on the Nissan Patrol Platinum?", daysAgo: 2, hour: 10 },
      { direction: "outbound", body: "The 2023 Nissan Patrol Platinum has 41,200 km on the odometer and is priced at AED 219,000.", daysAgo: 2, hour: 10 },
    ],
  },
  {
    id: "conv-010", channel: "ai_agent", contactName: "Anonymous Visitor", unreadCount: 1,
    messages: [
      { direction: "inbound", body: "How much would you offer for my 2021 Toyota Camry trade-in?", daysAgo: 0, hour: 15 },
      { direction: "outbound", body: "Trade-in offers depend on condition and mileage. Could you share the current mileage and any accident history?", daysAgo: 0, hour: 15 },
      { direction: "inbound", body: "About 38,000 km, no accidents.", daysAgo: 0, hour: 16 },
    ],
  },
];

export const conversationsFixture: Conversation[] = seeds.map((seed) => {
  const last = seed.messages[seed.messages.length - 1];
  return {
    id: seed.id,
    channel: seed.channel,
    contactName: seed.contactName,
    contactAvatarUrl: seed.contactAvatarUrl ?? (seed.channel === "website_chat" || seed.contactName === "Anonymous Visitor" ? undefined : avatar(seed.id)),
    customerId: seed.customerId,
    lastMessagePreview: last.body,
    lastMessageAt: iso(last.daysAgo, last.hour),
    unreadCount: seed.unreadCount,
  };
});

export const conversationMessagesFixture: ConversationMessage[] = seeds.flatMap((seed) =>
  seed.messages.map((m, index) => ({
    id: `${seed.id}-msg-${index + 1}`,
    conversationId: seed.id,
    direction: m.direction,
    body: m.body,
    createdAt: iso(m.daysAgo, m.hour),
  }))
);
