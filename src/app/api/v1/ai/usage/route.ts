import { apiRoute } from "@/server/http/api-route";
import { getUsageSummary } from "@/server/modules/ai/ai-usage-settings.service";

export const GET = apiRoute({ permission: ["ai_activity", "read"] }, ({ ctx, query }) => getUsageSummary(ctx, query));
