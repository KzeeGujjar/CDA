import type { Invoice } from "@/types/settings";

export const invoicesFixture: Invoice[] = [
  { id: "inv-2026-09", date: "2026-09-01", amount: 999, status: "paid" },
  { id: "inv-2026-08", date: "2026-08-01", amount: 999, status: "paid" },
  { id: "inv-2026-07", date: "2026-07-01", amount: 999, status: "paid" },
];
