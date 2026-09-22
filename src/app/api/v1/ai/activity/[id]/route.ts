import { apiRoute } from "@/server/http/api-route";
import { reviewActivity, reviewSchema } from "@/server/modules/ai/ai-activity.service";

export const PATCH = apiRoute<{ id: string }>(
  { permission: ["ai_activity", "update"] },
  async ({ ctx, params, body, meta }) => reviewActivity(ctx, params.id, await body(reviewSchema), meta)
);
