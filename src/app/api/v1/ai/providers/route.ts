import { apiRoute } from "@/server/http/api-route";
import { listProviders } from "@/server/modules/ai/ai-conversations.service";

export const GET = apiRoute({ permission: ["ai_agent", "read"] }, ({ ctx }) => listProviders(ctx));
