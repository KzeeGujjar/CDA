import type { AiInsight, AnalyticsSnapshot, DealerPerformanceSummary } from "@/types/analytics";
import { aiInsightsFixture, analyticsSnapshotFixture, dealerPerformanceSummaryFixture } from "@/mock/analytics";

const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDealerPerformanceSummary(): Promise<DealerPerformanceSummary> {
  await wait();
  return dealerPerformanceSummaryFixture;
}

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  await wait();
  return analyticsSnapshotFixture;
}

export async function getAiInsights(): Promise<AiInsight[]> {
  await wait(300);
  return aiInsightsFixture;
}
