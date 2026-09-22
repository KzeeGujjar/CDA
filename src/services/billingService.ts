import type { Invoice } from "@/types/settings";
import { invoicesFixture } from "@/mock/billing";

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getInvoices(): Promise<Invoice[]> {
  await wait();
  return invoicesFixture;
}
