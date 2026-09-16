import type { Customer } from "@/types/customer";

function avatar(seed: string) {
  return `https://i.pravatar.cc/150?u=${seed}`;
}

export const customersFixture: Customer[] = [
  { id: "cus-001", name: "Ahmed Al Mazrouei", email: "ahmed.almazrouei@example.ae", phone: "+971 50 123 4567", avatarUrl: avatar("ahmed1"), nationality: "UAE", preferredLanguage: "ar", address: "Villa 14, Al Barsha 2, Dubai", tags: ["VIP", "Repeat Buyer"], createdAt: "2025-11-02", lifetimeValue: 1450000 },
  { id: "cus-002", name: "Fatima Al Suwaidi", email: "fatima.suwaidi@example.ae", phone: "+971 55 234 5678", avatarUrl: avatar("fatima1"), nationality: "UAE", preferredLanguage: "ar", address: "Apt 802, Marina Heights, Dubai Marina", tags: ["VIP"], createdAt: "2025-12-14", lifetimeValue: 895000 },
  { id: "cus-003", name: "Rajesh Kumar", email: "rajesh.kumar@example.com", phone: "+971 52 345 6789", avatarUrl: avatar("rajesh1"), nationality: "India", preferredLanguage: "hi", address: "Office 1104, Business Bay, Dubai", tags: ["Fleet"], createdAt: "2026-01-08", lifetimeValue: 320000 },
  { id: "cus-004", name: "Sarah Thompson", email: "sarah.thompson@example.com", phone: "+971 56 456 7890", avatarUrl: avatar("sarah1"), nationality: "UK", preferredLanguage: "en", address: "Villa 27, Arabian Ranches, Dubai", tags: [], createdAt: "2026-02-19", lifetimeValue: 210000 },
  { id: "cus-005", name: "Muhammad Bilal", email: "m.bilal@example.pk", phone: "+971 50 567 8901", avatarUrl: avatar("bilal1"), nationality: "Pakistan", preferredLanguage: "ur", address: "Apt 305, Al Nahda, Dubai", tags: ["Referral"], createdAt: "2026-03-03", lifetimeValue: 165000 },
  { id: "cus-006", name: "Omar Al Falasi", email: "omar.falasi@example.ae", phone: "+971 55 678 9012", avatarUrl: avatar("omar1"), nationality: "UAE", preferredLanguage: "ar", address: "Villa 3, Emirates Hills, Dubai", tags: ["VIP", "Repeat Buyer"], createdAt: "2025-09-27", lifetimeValue: 2100000 },
  { id: "cus-007", name: "Elena Petrova", email: "elena.petrova@example.ru", phone: "+971 52 789 0123", avatarUrl: avatar("elena1"), nationality: "Russia", preferredLanguage: "en", address: "Apt 1502, Jumeirah Beach Residence, Dubai", tags: [], createdAt: "2026-04-11", lifetimeValue: 118000 },
  { id: "cus-008", name: "Khalid Al Nuaimi", email: "khalid.nuaimi@example.ae", phone: "+971 50 890 1234", avatarUrl: avatar("khalid1"), nationality: "UAE", preferredLanguage: "ar", address: "Office 6, Al Nuaimi Trading, Deira, Dubai", tags: ["Fleet"], createdAt: "2026-01-30", lifetimeValue: 780000 },
  { id: "cus-009", name: "Priya Nair", email: "priya.nair@example.com", phone: "+971 56 901 2345", avatarUrl: avatar("priya1"), nationality: "India", preferredLanguage: "hi", address: "Apt 210, Discovery Gardens, Dubai", tags: [], createdAt: "2026-05-06", lifetimeValue: 95000 },
  { id: "cus-010", name: "Hassan Raza", email: "hassan.raza@example.pk", phone: "+971 55 012 3456", avatarUrl: avatar("hassan1"), nationality: "Pakistan", preferredLanguage: "ur", address: "Apt 604, Al Qusais, Dubai", tags: ["Referral"], createdAt: "2026-02-27", lifetimeValue: 142000 },
  { id: "cus-011", name: "Mariam Al Zaabi", email: "mariam.zaabi@example.ae", phone: "+971 50 123 9988", avatarUrl: avatar("mariam1"), nationality: "UAE", preferredLanguage: "ar", address: "Villa 9, Al Muhaisnah, Dubai", tags: ["VIP"], createdAt: "2025-10-19", lifetimeValue: 1120000 },
  { id: "cus-012", name: "James Carter", email: "james.carter@example.com", phone: "+971 52 234 8877", avatarUrl: avatar("james1"), nationality: "USA", preferredLanguage: "en", address: "Apt 1108, Downtown Dubai", tags: [], createdAt: "2026-03-22", lifetimeValue: 205000 },
  { id: "cus-013", name: "Aisha Al Mheiri", email: "aisha.mheiri@example.ae", phone: "+971 56 345 7766", avatarUrl: avatar("aisha1"), nationality: "UAE", preferredLanguage: "ar", address: "Villa 41, Mirdif, Dubai", tags: ["Repeat Buyer"], createdAt: "2025-08-14", lifetimeValue: 640000 },
  { id: "cus-014", name: "Zainab Sheikh", email: "zainab.sheikh@example.pk", phone: "+971 50 456 6655", avatarUrl: avatar("zainab1"), nationality: "Pakistan", preferredLanguage: "ur", address: "Apt 508, Al Barsha 1, Dubai", tags: [], createdAt: "2026-04-30", lifetimeValue: 88000 },
  { id: "cus-015", name: "Arjun Mehta", email: "arjun.mehta@example.com", phone: "+971 55 567 5544", avatarUrl: avatar("arjun1"), nationality: "India", preferredLanguage: "hi", address: "Apt 902, Dubai Silicon Oasis", tags: ["Fleet"], createdAt: "2026-01-15", lifetimeValue: 410000 },
];
