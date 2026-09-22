import { apiRoute } from "@/server/http/api-route";
import { getActivitySummary } from "@/server/modules/ai/ai-activity.service";

export const GET = apiRoute({ permission: ["ai_activity", "read"] }, ({ ctx, query }) =>
  getActivitySummary(ctx, query)
);
