import type { DealershipUser } from "@/types/settings";
import { salespeople } from "@/lib/salespeople";

function emailFor(name: string) {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@autodesk.ae`;
}

export const dealershipUsersFixture: DealershipUser[] = [
  { id: "u-001", name: "Sales Manager", email: emailFor("Sales Manager"), role: "dealerOwner", status: "active" },
  { id: "u-002", name: "Platform Admin", email: "admin@autodeskai.com", role: "superAdmin", status: "active" },
  { id: "u-003", name: salespeople[0], email: emailFor(salespeople[0]), role: "manager", status: "active" },
  ...salespeople.slice(1).map((name, i) => ({
    id: `u-10${i}`,
    name,
    email: emailFor(name),
    role: "salesperson" as const,
    status: "active" as const,
  })),
  { id: "u-020", name: "Rashid Al Mansoori", email: emailFor("Rashid Al Mansoori"), role: "buyer", status: "active" },
  { id: "u-021", name: "Huda Al Ketbi", email: emailFor("Huda Al Ketbi"), role: "accountant", status: "active" },
  { id: "u-022", name: "Sara Al Blooshi", email: emailFor("Sara Al Blooshi"), role: "marketingManager", status: "active" },
  { id: "u-023", name: "Tariq Al Suwaidi", email: emailFor("Tariq Al Suwaidi"), role: "viewer", status: "invited" },
];
