import { apiRoute } from "@/server/http/api-route";
import { listActivity } from "@/server/modules/ai/ai-activity.service";

export const GET = apiRoute({ permission: ["ai_activity", "read"] }, ({ ctx, query }) => listActivity(ctx, query));
