/**
 * Demo data for a FICTIONAL UAE car dealership. Nothing here describes a real person, company or vehicle:
 *  - names are common first and family names combined at random;
 *  - e-mail addresses use the reserved `.example` domain (RFC 2606), so they can never reach a real mailbox;
 *  - phone numbers use a subscriber block of zeros (`+971 50 000 0xxx`), which is not assigned to anyone;
 *  - VINs are format-valid (correct check digit) but built from a visible marker (`D3M0X`) so none is a real car.
 * All money is in AED. Dates are day offsets from the moment the seed runs, so the demo always looks current.
 *
 * Only the data lives here; prisma/seed-demo.ts turns it into rows.
 */
import type {
  DealStatus,
  Emirate,
  LeadSource,
  LeadStage,
  NotificationKind,
  TaskCategory,
  TaskPriority,
  VehicleCondition,
  VehicleImportSpec,
  VehicleSourceType,
  VehicleStatus,
} from "@/generated/prisma/enums";
import type { RoleKey } from "@/lib/settings-roles";

/** Fixed id: it is how the seed recognises its own organization on a second run. */
export const DEMO_ORGANIZATION_ID = "demo-desert-falcon-motors";
export const DEMO_EMAIL_DOMAIN = "desertfalcon-demo.example";
export const CUSTOMER_EMAIL_DOMAIN = "mail.example";
/** The dirham's fixed peg to the dollar (UAE Central Bank), the same rate the currency catalog holds. */
export const USD_TO_AED = 3.6725;

export const organization = {
  name: "Desert Falcon Motors",
  legalName: "Desert Falcon Motors Trading LLC",
  email: `info@${DEMO_EMAIL_DOMAIN}`,
  phone: "+971 4 000 0100",
  address: "Al Quoz Industrial Area 3",
  city: "Dubai",
  emirate: "DUBAI" as Emirate,
  // A placeholder in the TRN format (15 digits, starts with 100), not a registered number.
  taxNumber: "100000000000003",
};

export type BranchKey = "dxb" | "auh" | "shj";
export const branches: {
  key: BranchKey;
  name: string;
  code: string;
  phone: string;
  address: string;
  city: string;
  emirate: Emirate;
  isPrimary?: boolean;
}[] = [
  { key: "dxb", name: "Downtown Dubai Showroom", code: "DXB", phone: "+971 4 000 0110", address: "Sheikh Zayed Road", city: "Dubai", emirate: "DUBAI", isPrimary: true },
  { key: "auh", name: "Abu Dhabi Branch", code: "AUH", phone: "+971 2 000 0120", address: "Mussafah Industrial Area", city: "Abu Dhabi", emirate: "ABU_DHABI" },
  { key: "shj", name: "Sharjah Auto Park", code: "SHJ", phone: "+971 6 000 0130", address: "Industrial Area 13", city: "Sharjah", emirate: "SHARJAH" },
];

export type UserKey = "owner" | "manager" | "sales1" | "sales2" | "sales3" | "buyer" | "accountant" | "marketing" | "viewer";
export const users: { key: UserKey; name: string; role: Exclude<RoleKey, "superAdmin">; branches: BranchKey[] }[] = [
  { key: "owner", name: "Saeed Al Marri", role: "dealerOwner", branches: ["dxb", "auh", "shj"] },
  { key: "manager", name: "Layla Hassan", role: "manager", branches: ["dxb"] },
  { key: "sales1", name: "Yousef Karim", role: "salesperson", branches: ["dxb"] },
  { key: "sales2", name: "Noora Al Hammadi", role: "salesperson", branches: ["auh"] },
  { key: "sales3", name: "Michael Chen", role: "salesperson", branches: ["shj"] },
  { key: "buyer", name: "Rashid Al Mansoori", role: "buyer", branches: ["dxb"] },
  { key: "accountant", name: "Huda Al Ketbi", role: "accountant", branches: ["dxb"] },
  { key: "marketing", name: "Sara Al Blooshi", role: "marketingManager", branches: ["dxb"] },
  { key: "viewer", name: "Tariq Al Suwaidi", role: "viewer", branches: ["dxb"] },
];

export const customers = [
  "Ahmed Al Mazrouei", "Fatima Al Suwaidi", "Rajesh Kumar", "Sarah Thompson", "Muhammad Bilal",
  "Omar Al Falasi", "Elena Petrova", "Khalid Al Nuaimi", "Priya Nair", "Hassan Raza",
  "Mariam Al Zaabi", "James Carter", "Aisha Al Mheiri", "Zainab Sheikh", "Arjun Mehta",
  "Noura Al Kaabi", "Vikram Singh", "Ivan Kozlov", "Mohammed Al Shamsi", "Chloe Dubois",
] as const;
export type CustomerKey = "ahmed" | "fatima" | "rajesh" | "sarah" | "muhammad" | "omar" | "elena" | "khalid" | "priya" | "hassan" | "mariam" | "james" | "aisha" | "zainab" | "arjun" | "noura" | "vikram" | "ivan" | "mohammed" | "chloe";
/** "Ahmed Al Mazrouei" -> "ahmed" (first names are unique in the list). */
export const customerKey = (name: string) => name.split(" ")[0].toLowerCase() as CustomerKey;

export type VehicleKey =
  | "lc300" | "patrol" | "g63" | "lx600" | "x7" | "cayenne" | "rrs" | "f150" | "tahoe" | "q8" | "telluride" | "palisade"
  | "modelx" | "pajero" | "yukon" | "camry" | "bentayga" | "pilot" | "defender" | "wrangler" | "altima" | "vxr" | "s580"
  | "bmw740" | "p911" | "model3" | "mustang" | "charger" | "escalade" | "urus" | "sonata" | "sportage" | "gle450"
  | "hilux" | "patrolnismo" | "rx350";

export interface VehicleRow {
  key: VehicleKey;
  make: string;
  model: string;
  trim: string;
  year: number;
  cond: VehicleCondition;
  km: number;
  /** SOLD only ever comes from a completed deal (a database rule); every SOLD row needs a completed deal below. */
  status: VehicleStatus;
  list: number;
  /** what the dealership paid, in AED */
  buy?: number;
  /** what it paid in US dollars (imports and auctions); the AED figure is derived at the fixed peg */
  buyUsd?: number;
  repair: number;
  transport: number;
  emirate: Emirate;
  spec: VehicleImportSpec;
  src: VehicleSourceType;
  branch: BranchKey;
  /** days ago it was acquired */
  acq: number;
  /** estimated market value when it is not close to the list price */
  mkt?: number;
}

const V = (r: VehicleRow) => r;
export const vehicles: VehicleRow[] = [
  V({ key: "lc300", make: "Toyota", model: "Land Cruiser", trim: "GXR V6", year: 2024, cond: "NEW", km: 12, status: "AVAILABLE", list: 285000, buy: 248000, repair: 0, transport: 3500, emirate: "DUBAI", spec: "GCC", src: "DEALER", branch: "dxb", acq: 21, mkt: 292000 }),
  V({ key: "patrol", make: "Nissan", model: "Patrol", trim: "Platinum", year: 2023, cond: "USED", km: 18500, status: "AVAILABLE", list: 219000, buy: 189000, repair: 3500, transport: 2000, emirate: "SHARJAH", spec: "UAE", src: "PRIVATE", branch: "shj", acq: 48 }),
  V({ key: "g63", make: "Mercedes-Benz", model: "G-Class", trim: "G63 AMG", year: 2024, cond: "NEW", km: 5, status: "RESERVED", list: 895000, buy: 780000, repair: 0, transport: 6000, emirate: "DUBAI", spec: "GCC", src: "EXPORT", branch: "dxb", acq: 13 }),
  V({ key: "lx600", make: "Lexus", model: "LX", trim: "600 VIP", year: 2023, cond: "USED", km: 9800, status: "RESERVED", list: 465000, buy: 410000, repair: 4000, transport: 2500, emirate: "DUBAI", spec: "UAE", src: "PRIVATE", branch: "dxb", acq: 28 }),
  V({ key: "x7", make: "BMW", model: "X7", trim: "M60i", year: 2024, cond: "NEW", km: 8, status: "AVAILABLE", list: 445000, buy: 392000, repair: 0, transport: 4500, emirate: "ABU_DHABI", spec: "GCC", src: "DEALER", branch: "auh", acq: 10 }),
  V({ key: "cayenne", make: "Porsche", model: "Cayenne", trim: "Turbo GT", year: 2023, cond: "USED", km: 14200, status: "SOLD", list: 610000, buy: 545000, repair: 5000, transport: 3000, emirate: "DUBAI", spec: "GCC", src: "AUCTION", branch: "dxb", acq: 65 }),
  V({ key: "rrs", make: "Range Rover", model: "Sport", trim: "Autobiography", year: 2024, cond: "NEW", km: 15, status: "AVAILABLE", list: 520000, buy: 462000, repair: 0, transport: 5000, emirate: "DUBAI", spec: "GCC", src: "DEALER", branch: "dxb", acq: 16 }),
  V({ key: "f150", make: "Ford", model: "F-150", trim: "Raptor", year: 2023, cond: "USED", km: 21400, status: "AVAILABLE", list: 215000, buyUsd: 50900, repair: 6000, transport: 7000, emirate: "ABU_DHABI", spec: "IMPORTED", src: "IMPORT", branch: "auh", acq: 74 }),
  V({ key: "tahoe", make: "Chevrolet", model: "Tahoe", trim: "High Country", year: 2024, cond: "NEW", km: 0, status: "IN_TRANSIT", list: 245000, buyUsd: 58300, repair: 0, transport: 6500, emirate: "DUBAI", spec: "IMPORTED", src: "IMPORT", branch: "dxb", acq: 9 }),
  V({ key: "q8", make: "Audi", model: "Q8", trim: "55 TFSI S-Line", year: 2023, cond: "USED", km: 16700, status: "AVAILABLE", list: 285000, buy: 251000, repair: 5500, transport: 2000, emirate: "AJMAN", spec: "GCC", src: "PRIVATE", branch: "shj", acq: 41 }),
  V({ key: "telluride", make: "Kia", model: "Telluride", trim: "SX Prestige", year: 2024, cond: "NEW", km: 20, status: "AVAILABLE", list: 148000, buy: 127000, repair: 0, transport: 2000, emirate: "ABU_DHABI", spec: "GCC", src: "DEALER", branch: "auh", acq: 18 }),
  V({ key: "palisade", make: "Hyundai", model: "Palisade", trim: "Calligraphy", year: 2023, cond: "USED", km: 24300, status: "AVAILABLE", list: 129000, buy: 111000, repair: 3000, transport: 1500, emirate: "DUBAI", spec: "UAE", src: "PRIVATE", branch: "dxb", acq: 56, mkt: 126000 }),
  V({ key: "modelx", make: "Tesla", model: "Model X", trim: "Plaid", year: 2024, cond: "NEW", km: 4, status: "AVAILABLE", list: 425000, buyUsd: 101300, repair: 0, transport: 8000, emirate: "DUBAI", spec: "IMPORTED", src: "IMPORT", branch: "dxb", acq: 12 }),
  V({ key: "pajero", make: "Mitsubishi", model: "Pajero", trim: "GLS", year: 2022, cond: "USED", km: 41200, status: "UNDER_REPAIR", list: 98000, buy: 84000, repair: 9000, transport: 1500, emirate: "RAS_AL_KHAIMAH", spec: "GCC", src: "AUCTION", branch: "shj", acq: 81, mkt: 95000 }),
  V({ key: "yukon", make: "GMC", model: "Yukon", trim: "Denali Ultimate", year: 2024, cond: "NEW", km: 10, status: "AVAILABLE", list: 275000, buyUsd: 65600, repair: 0, transport: 6500, emirate: "ABU_DHABI", spec: "IMPORTED", src: "IMPORT", branch: "auh", acq: 23 }),
  V({ key: "camry", make: "Toyota", model: "Camry", trim: "GLE", year: 2023, cond: "USED", km: 19800, status: "AVAILABLE", list: 89000, buy: 76000, repair: 2000, transport: 1200, emirate: "FUJAIRAH", spec: "GCC", src: "AUCTION", branch: "shj", acq: 36 }),
  V({ key: "bentayga", make: "Bentley", model: "Bentayga", trim: "EWB Azure", year: 2024, cond: "NEW", km: 3, status: "RESERVED", list: 1250000, buy: 1090000, repair: 0, transport: 9000, emirate: "DUBAI", spec: "GCC", src: "EXPORT", branch: "dxb", acq: 9 }),
  V({ key: "pilot", make: "Honda", model: "Pilot", trim: "Elite", year: 2023, cond: "USED", km: 22100, status: "AVAILABLE", list: 118000, buy: 101000, repair: 2500, transport: 1500, emirate: "UMM_AL_QUWAIN", spec: "GCC", src: "PRIVATE", branch: "shj", acq: 44 }),
  V({ key: "defender", make: "Land Rover", model: "Defender", trim: "110 X-Dynamic", year: 2024, cond: "NEW", km: 18, status: "AVAILABLE", list: 335000, buy: 295000, repair: 0, transport: 4000, emirate: "ABU_DHABI", spec: "GCC", src: "DEALER", branch: "auh", acq: 29 }),
  V({ key: "wrangler", make: "Jeep", model: "Wrangler", trim: "Rubicon 4xe", year: 2023, cond: "USED", km: 12900, status: "SOLD", list: 165000, buyUsd: 38700, repair: 3000, transport: 4500, emirate: "DUBAI", spec: "IMPORTED", src: "IMPORT", branch: "dxb", acq: 61 }),
  V({ key: "altima", make: "Nissan", model: "Altima", trim: "SV", year: 2022, cond: "USED", km: 47200, status: "SOLD", list: 58000, buy: 49500, repair: 1800, transport: 400, emirate: "SHARJAH", spec: "GCC", src: "PRIVATE", branch: "shj", acq: 130 }),
  V({ key: "vxr", make: "Toyota", model: "Land Cruiser", trim: "VXR", year: 2022, cond: "USED", km: 38500, status: "SOLD", list: 265000, buy: 231000, repair: 2500, transport: 1200, emirate: "DUBAI", spec: "GCC", src: "PRIVATE", branch: "dxb", acq: 150 }),
  V({ key: "s580", make: "Mercedes-Benz", model: "S-Class", trim: "S580", year: 2023, cond: "CERTIFIED_PRE_OWNED", km: 21000, status: "SOLD", list: 495000, buy: 438000, repair: 4000, transport: 1800, emirate: "DUBAI", spec: "GCC", src: "DEALER", branch: "dxb", acq: 175 }),
  V({ key: "bmw740", make: "BMW", model: "740Li", trim: "M Sport", year: 2022, cond: "USED", km: 33400, status: "SOLD", list: 235000, buy: 204000, repair: 3200, transport: 900, emirate: "ABU_DHABI", spec: "GCC", src: "PRIVATE", branch: "auh", acq: 140 }),
  V({ key: "p911", make: "Porsche", model: "911", trim: "Carrera S", year: 2022, cond: "CERTIFIED_PRE_OWNED", km: 15900, status: "SOLD", list: 575000, buy: 512000, repair: 3800, transport: 1500, emirate: "DUBAI", spec: "GCC", src: "DEALER", branch: "dxb", acq: 110 }),
  V({ key: "model3", make: "Tesla", model: "Model 3", trim: "Long Range", year: 2023, cond: "USED", km: 24800, status: "SOLD", list: 128000, buy: 108000, repair: 900, transport: 500, emirate: "DUBAI", spec: "GCC", src: "PRIVATE", branch: "dxb", acq: 95 }),
  V({ key: "mustang", make: "Ford", model: "Mustang", trim: "GT Premium", year: 2022, cond: "USED", km: 29700, status: "SOLD", list: 118000, buyUsd: 27400, repair: 5200, transport: 5500, emirate: "SHARJAH", spec: "IMPORTED", src: "IMPORT", branch: "shj", acq: 100 }),
  V({ key: "charger", make: "Dodge", model: "Charger", trim: "R/T Scat Pack", year: 2021, cond: "USED", km: 52800, status: "UNDER_INSPECTION", list: 112000, buyUsd: 24500, repair: 6500, transport: 5200, emirate: "AJMAN", spec: "IMPORTED", src: "IMPORT", branch: "shj", acq: 58 }),
  V({ key: "escalade", make: "Cadillac", model: "Escalade", trim: "Sport Platinum", year: 2023, cond: "USED", km: 27400, status: "AVAILABLE", list: 345000, buyUsd: 78000, repair: 0, transport: 7200, emirate: "DUBAI", spec: "IMPORTED", src: "IMPORT", branch: "dxb", acq: 34 }),
  V({ key: "urus", make: "Lamborghini", model: "Urus", trim: "S", year: 2023, cond: "USED", km: 11800, status: "AVAILABLE", list: 1150000, buy: 1020000, repair: 6000, transport: 2500, emirate: "DUBAI", spec: "GCC", src: "DEALER", branch: "dxb", acq: 27 }),
  V({ key: "sonata", make: "Hyundai", model: "Sonata", trim: "SEL", year: 2023, cond: "USED", km: 26900, status: "AVAILABLE", list: 71000, buy: 60500, repair: 1200, transport: 400, emirate: "DUBAI", spec: "UAE", src: "PRIVATE", branch: "dxb", acq: 52 }),
  V({ key: "sportage", make: "Kia", model: "Sportage", trim: "GT-Line", year: 2024, cond: "NEW", km: 30, status: "AVAILABLE", list: 118000, buy: 101500, repair: 0, transport: 900, emirate: "ABU_DHABI", spec: "GCC", src: "DEALER", branch: "auh", acq: 15 }),
  V({ key: "gle450", make: "Mercedes-Benz", model: "GLE", trim: "450 4MATIC", year: 2023, cond: "USED", km: 19200, status: "RESERVED", list: 285000, buy: 249000, repair: 3500, transport: 900, emirate: "SHARJAH", spec: "GCC", src: "PRIVATE", branch: "shj", acq: 38 }),
  V({ key: "hilux", make: "Toyota", model: "Hilux", trim: "Adventure", year: 2023, cond: "USED", km: 33600, status: "PURCHASED", list: 96000, buy: 82000, repair: 2800, transport: 1300, emirate: "RAS_AL_KHAIMAH", spec: "GCC", src: "PRIVATE", branch: "shj", acq: 3 }),
  V({ key: "patrolnismo", make: "Nissan", model: "Patrol", trim: "Nismo", year: 2024, cond: "NEW", km: 0, status: "IN_TRANSIT", list: 355000, buy: 312000, repair: 0, transport: 2800, emirate: "DUBAI", spec: "GCC", src: "DEALER", branch: "dxb", acq: 4 }),
  V({ key: "rx350", make: "Lexus", model: "RX", trim: "350 F Sport", year: 2023, cond: "USED", km: 22300, status: "UNDER_INSPECTION", list: 215000, buy: 187000, repair: 3100, transport: 1500, emirate: "FUJAIRAH", spec: "GCC", src: "PRIVATE", branch: "shj", acq: 6 }),
];

export interface DealRow {
  key: string;
  vehicle: VehicleKey;
  customer: CustomerKey;
  sales: UserKey;
  status: DealStatus;
  /** sale price as a share of the list price */
  factor: number;
  /** days ago the quotation was created / last changed */
  created: number;
  updated: number;
  /** days ago the sale was completed (only for COMPLETED deals) */
  completed?: number;
  notes?: string;
}
export const deals: DealRow[] = [
  { key: "d01", vehicle: "s580", customer: "aisha", sales: "manager", status: "COMPLETED", factor: 0.985, created: 132, updated: 121, completed: 121, notes: "Certified pre-owned warranty (12 months) included." },
  { key: "d02", vehicle: "vxr", customer: "khalid", sales: "sales2", status: "COMPLETED", factor: 0.98, created: 106, updated: 96, completed: 96, notes: "Company purchase, invoiced to Al Nuaimi Trading." },
  { key: "d03", vehicle: "altima", customer: "zainab", sales: "sales2", status: "COMPLETED", factor: 0.97, created: 92, updated: 84, completed: 84 },
  { key: "d04", vehicle: "bmw740", customer: "ivan", sales: "sales2", status: "COMPLETED", factor: 0.975, created: 76, updated: 68, completed: 68 },
  { key: "d05", vehicle: "p911", customer: "omar", sales: "manager", status: "COMPLETED", factor: 0.99, created: 55, updated: 47, completed: 47, notes: "Repeat customer. Trade-in of his previous Cayenne accepted at market value." },
  { key: "d06", vehicle: "model3", customer: "priya", sales: "sales3", status: "COMPLETED", factor: 0.97, created: 41, updated: 33, completed: 33 },
  { key: "d07", vehicle: "cayenne", customer: "mohammed", sales: "sales1", status: "COMPLETED", factor: 0.98, created: 31, updated: 24, completed: 24 },
  { key: "d08", vehicle: "mustang", customer: "james", sales: "sales1", status: "COMPLETED", factor: 0.975, created: 27, updated: 19, completed: 19 },
  { key: "d09", vehicle: "wrangler", customer: "arjun", sales: "sales3", status: "COMPLETED", factor: 0.98, created: 18, updated: 11, completed: 11 },
  { key: "d10", vehicle: "g63", customer: "ahmed", sales: "sales1", status: "SENT", factor: 1.0, created: 10, updated: 8, notes: "Quote includes 3-year service package. Customer is comparing financing offers." },
  { key: "d11", vehicle: "bentayga", customer: "omar", sales: "manager", status: "ACCEPTED", factor: 0.99, created: 9, updated: 3, notes: "Accepted subject to trade-in valuation of his current vehicle." },
  { key: "d12", vehicle: "lx600", customer: "mariam", sales: "sales2", status: "CONVERTED_TO_CONTRACT", factor: 0.98, created: 13, updated: 4, notes: "Contract prepared; awaiting bank transfer." },
  { key: "d13", vehicle: "gle450", customer: "sarah", sales: "sales3", status: "ACCEPTED", factor: 0.99, created: 12, updated: 5 },
  { key: "d14", vehicle: "rrs", customer: "fatima", sales: "sales2", status: "DRAFT", factor: 0.98, created: 4, updated: 4 },
  { key: "d15", vehicle: "pilot", customer: "hassan", sales: "sales2", status: "DECLINED", factor: 0.95, created: 40, updated: 29, notes: "Customer chose a newer model elsewhere." },
  { key: "d16", vehicle: "tahoe", customer: "muhammad", sales: "sales1", status: "CANCELLED", factor: 1.0, created: 33, updated: 30, notes: "Import delayed; customer withdrew." },
  { key: "d17", vehicle: "patrol", customer: "khalid", sales: "manager", status: "SENT", factor: 0.97, created: 7, updated: 6, notes: "Fleet quote for two units; second unit to be confirmed." },
  { key: "d18", vehicle: "yukon", customer: "arjun", sales: "sales3", status: "DRAFT", factor: 0.98, created: 3, updated: 3 },
];

export interface LeadRow {
  key: string;
  customer: CustomerKey;
  vehicle: VehicleKey;
  stage: LeadStage;
  source: LeadSource;
  score: number;
  sales: UserKey;
  /** budget as a share of the vehicle's list price */
  bf: number;
  /** days ago created / last contact (null = not contacted yet) */
  created: number;
  last: number | null;
  /** next follow-up: [days from today, hour of day in Dubai time]; null = none */
  next: [number, number] | null;
}
const L = (r: LeadRow) => r;
export const leads: LeadRow[] = [
  L({ key: "l01", customer: "rajesh", vehicle: "x7", stage: "NEW", source: "MARKETPLACE", score: 42, sales: "sales1", bf: 1.0, created: 1, last: null, next: [0, 15] }),
  L({ key: "l02", customer: "zainab", vehicle: "sonata", stage: "NEW", source: "WEBSITE", score: 38, sales: "sales2", bf: 0.98, created: 1, last: null, next: [0, 16] }),
  L({ key: "l03", customer: "vikram", vehicle: "sportage", stage: "NEW", source: "SOCIAL_MEDIA", score: 47, sales: "sales3", bf: 1.0, created: 2, last: null, next: [1, 10] }),
  L({ key: "l04", customer: "chloe", vehicle: "defender", stage: "NEW", source: "WEBSITE", score: 51, sales: "sales2", bf: 0.97, created: 2, last: null, next: [0, 17] }),
  L({ key: "l05", customer: "noura", vehicle: "escalade", stage: "NEW", source: "PHONE", score: 45, sales: "sales1", bf: 1.02, created: 3, last: null, next: [1, 11] }),
  L({ key: "l06", customer: "elena", vehicle: "modelx", stage: "CONTACTED", source: "MARKETPLACE", score: 58, sales: "sales1", bf: 0.97, created: 6, last: 2, next: [1, 12] }),
  L({ key: "l07", customer: "sarah", vehicle: "camry", stage: "CONTACTED", source: "WEBSITE", score: 55, sales: "sales3", bf: 1.03, created: 8, last: 3, next: [2, 10] }),
  L({ key: "l08", customer: "mohammed", vehicle: "urus", stage: "CONTACTED", source: "WALK_IN", score: 62, sales: "manager", bf: 0.95, created: 5, last: 1, next: [1, 15] }),
  L({ key: "l09", customer: "ivan", vehicle: "q8", stage: "CONTACTED", source: "REFERRAL", score: 60, sales: "sales2", bf: 0.98, created: 9, last: 4, next: [-1, 13] }),
  L({ key: "l10", customer: "hassan", vehicle: "f150", stage: "QUALIFIED", source: "WEBSITE", score: 71, sales: "sales2", bf: 0.96, created: 12, last: 3, next: [2, 14] }),
  L({ key: "l11", customer: "arjun", vehicle: "yukon", stage: "QUALIFIED", source: "PHONE", score: 68, sales: "sales3", bf: 1.0, created: 14, last: 2, next: [1, 16] }),
  L({ key: "l12", customer: "muhammad", vehicle: "telluride", stage: "QUALIFIED", source: "REFERRAL", score: 73, sales: "sales1", bf: 1.02, created: 16, last: 1, next: [3, 11] }),
  L({ key: "l13", customer: "khalid", vehicle: "patrol", stage: "QUALIFIED", source: "PHONE", score: 76, sales: "manager", bf: 0.98, created: 18, last: 2, next: [2, 10] }),
  L({ key: "l14", customer: "fatima", vehicle: "rrs", stage: "VIEWING", source: "WEBSITE", score: 74, sales: "sales2", bf: 0.98, created: 17, last: 3, next: [1, 13] }),
  L({ key: "l15", customer: "aisha", vehicle: "lc300", stage: "VIEWING", source: "WALK_IN", score: 79, sales: "sales3", bf: 1.0, created: 20, last: 2, next: [0, 17] }),
  L({ key: "l16", customer: "james", vehicle: "tahoe", stage: "VIEWING", source: "SOCIAL_MEDIA", score: 70, sales: "sales1", bf: 0.98, created: 11, last: 1, next: [1, 14] }),
  L({ key: "l17", customer: "priya", vehicle: "pilot", stage: "VIEWING", source: "MARKETPLACE", score: 69, sales: "sales3", bf: 0.97, created: 13, last: 3, next: [2, 15] }),
  L({ key: "l18", customer: "ahmed", vehicle: "g63", stage: "NEGOTIATION", source: "REFERRAL", score: 88, sales: "sales1", bf: 1.03, created: 20, last: 2, next: [1, 10] }),
  L({ key: "l19", customer: "omar", vehicle: "bentayga", stage: "NEGOTIATION", source: "REFERRAL", score: 91, sales: "manager", bf: 0.99, created: 24, last: 1, next: [0, 11] }),
  L({ key: "l20", customer: "mariam", vehicle: "lx600", stage: "NEGOTIATION", source: "WALK_IN", score: 85, sales: "sales2", bf: 0.98, created: 22, last: 2, next: [1, 12] }),
  L({ key: "l21", customer: "sarah", vehicle: "gle450", stage: "NEGOTIATION", source: "WEBSITE", score: 83, sales: "sales3", bf: 0.99, created: 19, last: 1, next: [2, 10] }),
  L({ key: "l22", customer: "aisha", vehicle: "s580", stage: "WON", source: "REFERRAL", score: 95, sales: "manager", bf: 1.0, created: 135, last: 121, next: null }),
  L({ key: "l23", customer: "khalid", vehicle: "vxr", stage: "WON", source: "PHONE", score: 93, sales: "sales2", bf: 1.0, created: 110, last: 96, next: null }),
  L({ key: "l24", customer: "zainab", vehicle: "altima", stage: "WON", source: "WEBSITE", score: 89, sales: "sales2", bf: 1.0, created: 100, last: 84, next: null }),
  L({ key: "l25", customer: "ivan", vehicle: "bmw740", stage: "WON", source: "REFERRAL", score: 90, sales: "sales2", bf: 1.0, created: 80, last: 68, next: null }),
  L({ key: "l26", customer: "omar", vehicle: "p911", stage: "WON", source: "WALK_IN", score: 96, sales: "manager", bf: 1.0, created: 60, last: 47, next: null }),
  L({ key: "l27", customer: "priya", vehicle: "model3", stage: "WON", source: "MARKETPLACE", score: 92, sales: "sales3", bf: 1.0, created: 48, last: 33, next: null }),
  L({ key: "l28", customer: "mohammed", vehicle: "cayenne", stage: "WON", source: "WALK_IN", score: 91, sales: "sales1", bf: 1.0, created: 38, last: 24, next: null }),
  L({ key: "l29", customer: "james", vehicle: "mustang", stage: "WON", source: "SOCIAL_MEDIA", score: 90, sales: "sales1", bf: 1.0, created: 35, last: 19, next: null }),
  L({ key: "l30", customer: "arjun", vehicle: "wrangler", stage: "WON", source: "PHONE", score: 92, sales: "sales3", bf: 1.0, created: 25, last: 11, next: null }),
  L({ key: "l31", customer: "hassan", vehicle: "pilot", stage: "LOST", source: "WEBSITE", score: 26, sales: "sales2", bf: 0.9, created: 45, last: 29, next: null }),
  L({ key: "l32", customer: "muhammad", vehicle: "tahoe", stage: "LOST", source: "SOCIAL_MEDIA", score: 31, sales: "sales1", bf: 1.0, created: 40, last: 30, next: null }),
];

export interface TaskRow {
  title: string;
  description?: string;
  cat: TaskCategory;
  pri: TaskPriority;
  /** [days from today, hour in Dubai time]; negative days are in the past */
  due: [number, number];
  /** completed this many days ago (omit for an open task) */
  doneAgo?: number;
  to: UserKey;
  by: UserKey;
  /** created by the AI agent on the creator's behalf */
  ai?: boolean;
  /** at most one record */
  vehicle?: VehicleKey;
  customer?: CustomerKey;
  lead?: string;
  deal?: string;
}
export const tasks: TaskRow[] = [
  { title: "Call Rajesh Kumar about the BMW X7", description: "New marketplace inquiry. Confirm budget and whether he needs financing.", cat: "CALL", pri: "HIGH", due: [0, 15], to: "sales1", by: "manager", lead: "l01" },
  { title: "Follow up with Ivan Kozlov on the Audi Q8", cat: "FOLLOW_UP", pri: "HIGH", due: [-1, 13], to: "sales2", by: "sales2", lead: "l09" },
  { title: "Send revised G63 quotation to Ahmed Al Mazrouei", description: "Include the 3-year service package and the two financing options.", cat: "QUOTATION", pri: "HIGH", due: [1, 10], to: "sales1", by: "sales1", deal: "d10" },
  { title: "Prepare Bentayga trade-in valuation", description: "Omar's current vehicle: inspect and get two market comparisons.", cat: "INSPECTION", pri: "HIGH", due: [0, 11], to: "manager", by: "manager", deal: "d11" },
  { title: "Collect signed contract for the Lexus LX 600", cat: "DOCUMENTS", pri: "MEDIUM", due: [1, 12], to: "sales2", by: "manager", deal: "d12" },
  { title: "Arrange test drive: Land Cruiser GXR for Aisha Al Mheiri", cat: "FOLLOW_UP", pri: "MEDIUM", due: [0, 17], to: "sales3", by: "sales3", lead: "l15" },
  { title: "Photograph the Cadillac Escalade", description: "Exterior, interior, dashboard and engine bay. 24 photos.", cat: "PHOTOGRAPHY", pri: "MEDIUM", due: [2, 11], to: "marketing", by: "manager", vehicle: "escalade" },
  { title: "Photograph the Lamborghini Urus", cat: "PHOTOGRAPHY", pri: "MEDIUM", due: [1, 14], to: "marketing", by: "manager", vehicle: "urus" },
  { title: "Finish pre-sale inspection: Dodge Charger", cat: "INSPECTION", pri: "MEDIUM", due: [2, 10], to: "buyer", by: "buyer", vehicle: "charger" },
  { title: "Finish pre-sale inspection: Lexus RX 350", cat: "INSPECTION", pri: "LOW", due: [4, 10], to: "buyer", by: "buyer", vehicle: "rx350" },
  { title: "Chase parts for the Mitsubishi Pajero repair", description: "Waiting on the rear differential seal. It has been in the workshop 81 days.", cat: "SERVICE", pri: "HIGH", due: [-2, 9], to: "buyer", by: "manager", vehicle: "pajero" },
  { title: "Clear customs paperwork for the Chevrolet Tahoe", cat: "DOCUMENTS", pri: "HIGH", due: [1, 9], to: "buyer", by: "manager", vehicle: "tahoe" },
  { title: "Register the incoming Toyota Hilux", cat: "DOCUMENTS", pri: "LOW", due: [5, 10], to: "buyer", by: "buyer", vehicle: "hilux" },
  { title: "Reconcile last month's sales invoices", description: "Match completed deals against bank receipts.", cat: "DOCUMENTS", pri: "MEDIUM", due: [3, 12], to: "accountant", by: "owner" },
  { title: "Prepare the delivery of the Jeep Wrangler", cat: "DELIVERY", pri: "MEDIUM", due: [-8, 15], doneAgo: 11, to: "sales3", by: "sales3", deal: "d09" },
  { title: "Call Hassan Raza to close the Honda Pilot file", cat: "CALL", pri: "LOW", due: [-30, 11], doneAgo: 29, to: "sales2", by: "sales2", lead: "l31" },
  { title: "Deliver the Ford Mustang GT", cat: "DELIVERY", pri: "HIGH", due: [-19, 16], doneAgo: 19, to: "sales1", by: "manager", deal: "d08" },
  { title: "Service and detail the Porsche Cayenne before handover", cat: "SERVICE", pri: "MEDIUM", due: [-26, 10], doneAgo: 25, to: "buyer", by: "manager", vehicle: "cayenne" },
  { title: "Send the Range Rover Sport quotation to Fatima Al Suwaidi", cat: "QUOTATION", pri: "MEDIUM", due: [-3, 12], doneAgo: 4, to: "sales2", by: "sales2", deal: "d14" },
  { title: "Follow up with Sarah Thompson on the GLE 450 paperwork", description: "Suggested by the AI agent after her quotation was accepted.", cat: "FOLLOW_UP", pri: "MEDIUM", due: [1, 11], to: "sales3", by: "sales3", ai: true, lead: "l21" },
  { title: "Re-price the Hyundai Palisade", description: "Suggested by the AI agent: 56 days in stock and listed above market.", cat: "FOLLOW_UP", pri: "MEDIUM", due: [2, 9], to: "manager", by: "manager", ai: true, vehicle: "palisade" },
  { title: "Contact Khalid Al Nuaimi about the second Patrol unit", description: "Suggested by the AI agent from the fleet quotation.", cat: "CALL", pri: "MEDIUM", due: [2, 10], to: "manager", by: "manager", ai: true, lead: "l13" },
];

export interface NotificationRow {
  to: UserKey;
  kind: NotificationKind;
  title: string;
  description: string;
  /** [days ago, hour in Dubai time] */
  at: [number, number];
  read: boolean;
  /** route in the app; ids are filled in from the seeded records */
  link?: { path: "leads" | "deals" | "inventory" | "ai-assistant" | "tasks" | "contracts-documents"; lead?: string; deal?: string; vehicle?: VehicleKey };
}
export const notifications: NotificationRow[] = [
  { to: "owner", kind: "DEAL", title: "Deal accepted", description: "Omar Al Falasi accepted the Bentley Bentayga quotation, subject to the trade-in valuation.", at: [3, 16], read: false, link: { path: "deals", deal: "d11" } },
  { to: "owner", kind: "DEAL", title: "Sale completed", description: "The Jeep Wrangler Rubicon 4xe was sold to Arjun Mehta.", at: [11, 15], read: true, link: { path: "deals", deal: "d09" } },
  { to: "owner", kind: "INVENTORY", title: "Vehicle aging alert", description: "The Mitsubishi Pajero GLS has been in stock for 81 days and is still under repair.", at: [1, 9], read: false, link: { path: "inventory", vehicle: "pajero" } },
  { to: "owner", kind: "AI", title: "AI found a profitable vehicle", description: "The AI price analysis flagged a Lamborghini Urus listing well below estimated market value.", at: [2, 8], read: true, link: { path: "ai-assistant" } },
  { to: "owner", kind: "SYSTEM", title: "Weekly summary ready", description: "Your weekly sales and inventory summary is ready to review.", at: [4, 7], read: true },
  { to: "manager", kind: "LEAD", title: "New marketplace inquiry", description: "Rajesh Kumar asked about the BMW X7 M60i through a marketplace listing and was assigned to Yousef Karim.", at: [0, 7], read: false, link: { path: "leads", lead: "l01" } },
  { to: "manager", kind: "DEAL", title: "Contract ready for signature", description: "The purchase agreement for Mariam Al Zaabi's Lexus LX 600 is ready.", at: [4, 14], read: false, link: { path: "contracts-documents" } },
  { to: "manager", kind: "PRICE", title: "Price review suggested", description: "The Hyundai Palisade Calligraphy is listed above its estimated market value.", at: [2, 10], read: true, link: { path: "inventory", vehicle: "palisade" } },
  { to: "manager", kind: "INSPECTION", title: "Inspection completed", description: "The pre-sale inspection of the Land Cruiser GXR found no issues.", at: [6, 12], read: true, link: { path: "inventory", vehicle: "lc300" } },
  { to: "sales1", kind: "LEAD", title: "2 new leads", description: "Rajesh Kumar and Noura Al Kaabi sent inquiries in the last 72 hours.", at: [0, 8], read: false, link: { path: "leads" } },
  { to: "sales1", kind: "DEAL", title: "Quotation viewed", description: "Ahmed Al Mazrouei opened the G63 AMG quotation.", at: [1, 18], read: false, link: { path: "deals", deal: "d10" } },
  { to: "sales1", kind: "AI", title: "AI drafted a follow-up", description: "A WhatsApp follow-up for Ahmed Al Mazrouei is ready for your review.", at: [2, 9], read: true, link: { path: "ai-assistant" } },
  { to: "sales1", kind: "SYSTEM", title: "Task due today", description: "Call Rajesh Kumar about the BMW X7.", at: [0, 7], read: false, link: { path: "tasks" } },
  { to: "sales2", kind: "LEAD", title: "Follow-up overdue", description: "The follow-up with Ivan Kozlov was due yesterday and no contact has been logged since.", at: [0, 6], read: false, link: { path: "leads", lead: "l09" } },
  { to: "sales2", kind: "LEAD", title: "Lead is viewing a vehicle", description: "Fatima Al Suwaidi is scheduled to view the Range Rover Sport tomorrow at 1 PM.", at: [1, 17], read: false, link: { path: "leads", lead: "l14" } },
  { to: "sales2", kind: "DOCUMENT", title: "Document uploaded", description: "The signed contract for Mariam Al Zaabi is waiting for your review.", at: [4, 15], read: true, link: { path: "contracts-documents" } },
  { to: "sales2", kind: "DEAL", title: "Deal sent", description: "The fleet quotation for Khalid Al Nuaimi was sent.", at: [6, 16], read: true, link: { path: "deals", deal: "d17" } },
  { to: "sales3", kind: "LEAD", title: "Test drive today", description: "Aisha Al Mheiri is visiting at 5 PM to test drive the Land Cruiser GXR.", at: [0, 8], read: false, link: { path: "leads", lead: "l15" } },
  { to: "sales3", kind: "DEAL", title: "Deal accepted", description: "Sarah Thompson accepted the Mercedes-Benz GLE 450 quotation.", at: [5, 11], read: true, link: { path: "deals", deal: "d13" } },
];

/** Descriptive details per vehicle (they become the `spec` and `registration` documents, notes, location and featured flag). */
export interface VehicleDetails {
  engine: string;
  hp: number;
  fuel: "petrol" | "diesel" | "hybrid" | "electric";
  transmission: "automatic" | "manual";
  exterior: string;
  interior: string;
  seats: number;
  body: string;
  accident: "none" | "minor" | "major";
  service: "full" | "partial" | "none";
  owners: number;
  /** registration: status, then plate and days until it expires (only for a registered or pending vehicle) */
  reg: ["registered" | "not_registered" | "pending_transfer", string?, number?];
  featured?: boolean;
  /** a yard or workshop when the vehicle is not simply at its branch */
  location?: string;
  notes?: string;
}
const D = (
  engine: string, hp: number, fuel: VehicleDetails["fuel"], transmission: VehicleDetails["transmission"],
  exterior: string, interior: string, seats: number, body: string, accident: VehicleDetails["accident"],
  service: VehicleDetails["service"], owners: number, reg: VehicleDetails["reg"], extra: Partial<VehicleDetails> = {}
): VehicleDetails => ({ engine, hp, fuel, transmission, exterior, interior, seats, body, accident, service, owners, reg, ...extra });
const NR: VehicleDetails["reg"] = ["not_registered"];
export const vehicleDetails: Record<VehicleKey, VehicleDetails> = {
  lc300: D("3.5L V6 Twin-Turbo", 409, "petrol", "automatic", "Pearl White", "Beige", 7, "SUV", "none", "full", 0, NR, { featured: true }),
  patrol: D("5.6L V8", 400, "petrol", "automatic", "Black", "Tan", 8, "SUV", "none", "full", 1, ["registered", "Sharjah 2 18823", 121]),
  g63: D("4.0L V8 Biturbo", 577, "petrol", "automatic", "Obsidian Black", "Black Nappa", 5, "SUV", "none", "full", 0, NR, { featured: true }),
  lx600: D("3.4L Twin-Turbo V6", 409, "petrol", "automatic", "Sonic Titanium", "Cream", 7, "SUV", "none", "full", 1, ["registered", "Dubai C 55210", 72]),
  x7: D("4.4L V8", 523, "petrol", "automatic", "Carbon Black", "Ivory White", 7, "SUV", "none", "full", 0, NR),
  cayenne: D("4.0L V8 Twin-Turbo", 631, "petrol", "automatic", "GT Silver", "Black/Red", 5, "SUV", "none", "full", 1, ["pending_transfer", "Dubai P 90114", 150]),
  rrs: D("4.4L V8 Twin-Turbo", 523, "petrol", "automatic", "Santorini Black", "Ebony", 5, "SUV", "none", "full", 0, NR, { featured: true }),
  f150: D("3.5L EcoBoost V6", 450, "petrol", "automatic", "Code Orange", "Black", 5, "Pickup", "none", "partial", 2, ["registered", "Abu Dhabi 7 33221", 200], { notes: "US-specification import; GCC conversion completed." }),
  tahoe: D("6.2L V8", 420, "petrol", "automatic", "Summit White", "Jet Black", 8, "SUV", "none", "full", 0, NR, { notes: "Shipped from the US; arriving at the Dubai showroom." }),
  q8: D("3.0L V6 Turbo", 335, "petrol", "automatic", "Daytona Grey", "Black Valcona", 5, "SUV", "minor", "full", 1, ["registered", "Ajman 3 60217", 55], { location: "Ajman Free Zone Yard" }),
  telluride: D("3.8L V6", 291, "petrol", "automatic", "Snow White Pearl", "Terracotta", 8, "SUV", "none", "full", 0, NR),
  palisade: D("3.8L V6", 291, "petrol", "automatic", "Abyss Black", "Beige", 8, "SUV", "none", "partial", 2, ["registered", "Dubai H 27340", 165]),
  modelx: D("Tri-Motor Electric", 1020, "electric", "automatic", "Deep Blue Metallic", "Cream", 6, "SUV", "none", "full", 0, NR, { featured: true }),
  pajero: D("3.8L V6", 250, "petrol", "automatic", "Silver", "Grey", 7, "SUV", "minor", "partial", 3, ["registered", "RAK 9 40881", 31], { location: "RAK Workshop Yard", notes: "Rear differential seal on order; repair in progress." }),
  yukon: D("6.2L V8", 420, "petrol", "automatic", "Onyx Black", "Very Dark Atmosphere", 7, "SUV", "none", "full", 0, NR),
  camry: D("2.5L I4", 203, "petrol", "automatic", "Celestial Silver", "Black", 5, "Sedan", "none", "full", 1, ["registered", "Fujairah 12 15230", 109], { location: "Fujairah Coastal Lot" }),
  bentayga: D("4.0L V8", 542, "petrol", "automatic", "Glacier White", "Linen", 5, "SUV", "none", "full", 0, NR, { featured: true }),
  pilot: D("3.5L V6", 285, "petrol", "automatic", "Modern Steel", "Black", 8, "SUV", "none", "full", 1, ["registered", "UAQ 6 8842", 100], { location: "Umm Al Quwain Yard" }),
  defender: D("3.0L I6 Turbo", 395, "petrol", "automatic", "Pangea Green", "Ebony", 5, "SUV", "none", "full", 0, NR),
  wrangler: D("2.0L Turbo Hybrid", 375, "hybrid", "automatic", "Firecracker Red", "Black", 5, "SUV", "none", "full", 1, ["pending_transfer", "Dubai M 71209", 159]),
  altima: D("2.5L I4", 188, "petrol", "automatic", "Gun Metallic", "Black", 5, "Sedan", "none", "full", 1, ["registered", "Sharjah 4 20417", 140]),
  vxr: D("3.5L V6 Twin-Turbo", 409, "petrol", "automatic", "Black Onyx", "Beige", 7, "SUV", "none", "full", 1, ["registered", "Dubai K 33802", 210]),
  s580: D("4.0L V8 Twin-Turbo", 496, "petrol", "automatic", "Obsidian Black", "Macchiato Beige", 5, "Sedan", "none", "full", 1, ["registered", "Dubai B 60125", 260]),
  bmw740: D("3.0L I6 Turbo", 375, "petrol", "automatic", "Alpine White", "Cognac", 5, "Sedan", "none", "full", 1, ["registered", "Abu Dhabi 11 48870", 180]),
  p911: D("3.0L Flat-6 Twin-Turbo", 443, "petrol", "automatic", "Racing Yellow", "Black", 4, "Coupe", "none", "full", 1, ["registered", "Dubai R 12094", 300]),
  model3: D("Dual-Motor Electric", 480, "electric", "automatic", "Pearl White", "Black", 5, "Sedan", "none", "full", 1, ["registered", "Dubai T 88015", 220]),
  mustang: D("5.0L V8", 450, "petrol", "manual", "Race Red", "Black", 4, "Coupe", "minor", "partial", 2, ["registered", "Sharjah 7 91133", 90]),
  charger: D("6.4L V8", 485, "petrol", "automatic", "Destroyer Grey", "Black", 5, "Sedan", "none", "partial", 2, NR, { location: "Ajman Free Zone Yard", notes: "Import documents complete; awaiting pre-sale inspection." }),
  escalade: D("6.2L V8", 420, "petrol", "automatic", "Black Raven", "Jet Black", 7, "SUV", "none", "full", 1, ["registered", "Dubai N 40276", 175]),
  urus: D("4.0L V8 Twin-Turbo", 657, "petrol", "automatic", "Giallo Auge", "Nero Ade", 5, "SUV", "none", "full", 1, ["registered", "Dubai A 7720", 240], { featured: true }),
  sonata: D("2.5L I4", 191, "petrol", "automatic", "Hampton Grey", "Black", 5, "Sedan", "none", "full", 1, ["registered", "Dubai J 51448", 130]),
  sportage: D("2.5L I4", 187, "petrol", "automatic", "Wolf Grey", "Black", 5, "SUV", "none", "full", 0, NR),
  gle450: D("3.0L I6 Turbo", 375, "petrol", "automatic", "Polar White", "Black", 5, "SUV", "none", "full", 1, ["registered", "Sharjah 5 30962", 190]),
  hilux: D("2.8L Turbo Diesel", 201, "diesel", "automatic", "Bronze", "Black", 5, "Pickup", "minor", "partial", 2, ["registered", "RAK 3 17740", 95], { location: "Ras Al Khaimah Pickup Point", notes: "Bought from a private seller; awaiting collection." }),
  patrolnismo: D("3.5L V6 Twin-Turbo", 425, "petrol", "automatic", "Burning Red", "Black/Red", 7, "SUV", "none", "full", 0, NR),
  rx350: D("2.4L Turbo I4", 275, "petrol", "automatic", "Caviar", "Rich Cream", 5, "SUV", "none", "full", 1, ["registered", "Fujairah 8 22591", 250], { location: "Fujairah Coastal Lot" }),
};
