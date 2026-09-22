import type { AiActivityEntry, AiActivityFilters, AiActivitySummary } from "@/types/ai-activity";
import { aiActivityFixture } from "@/mock/ai-activity";

const entries: AiActivityEntry[] = [...aiActivityFixture];

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getAiActivityLog(filters?: AiActivityFilters): Promise<AiActivityEntry[]> {
  await wait();
  return entries
    .filter((e) => {
      if (filters?.status && e.status !== filters.status) return false;
      if (filters?.action && e.action !== filters.action) return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        const haystack = `${e.vehicleLabel ?? ""} ${e.customerName ?? ""} ${e.result}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function getAiActivitySummary(): Promise<AiActivitySummary> {
  await wait(200);
  const totalActions = entries.length;
  const completed = entries.filter((e) => e.status === "completed").length;
  const needsReview = entries.filter((e) => e.status === "needs_review" || e.status === "failed").length;
  return {
    totalActions,
    completed,
    needsReview,
    timeSavedHours: Math.round((totalActions * 0.35 + Number.EPSILON) * 10) / 10,
  };
}
