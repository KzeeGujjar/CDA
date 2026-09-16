import type { BankEvaluationInput, BankEvaluationRequest } from "@/types/bank-evaluation";
import { bankEvaluationsFixture } from "@/mock/bank-evaluations";
import { uaeBanks, BANK_EVALUATION_FEE_AED } from "@/lib/uae-banks";

let evaluations: BankEvaluationRequest[] = [...bankEvaluationsFixture];

const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getBankEvaluations(): Promise<BankEvaluationRequest[]> {
  await wait();
  return [...evaluations].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function requestBankEvaluation(input: BankEvaluationInput): Promise<BankEvaluationRequest> {
  await wait(600);
  const bank = uaeBanks.find((b) => b.code === input.bankCode);
  if (!bank) throw new Error("Unknown bank");

  const evaluation: BankEvaluationRequest = {
    id: `bev-${Math.random().toString(36).slice(2, 9)}`,
    vehicleId: input.vehicleId,
    vehicleLabel: input.vehicleLabel,
    bankCode: input.bankCode,
    bankName: bank.name,
    customerName: input.customerName,
    fee: { amount: BANK_EVALUATION_FEE_AED, currency: "AED" },
    status: "requested",
    requestedAt: new Date().toISOString(),
    notes: input.notes,
  };
  evaluations = [evaluation, ...evaluations];
  return evaluation;
}
