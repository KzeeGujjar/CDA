import { apiRoute } from "@/server/http/api-route";
import { listAgentTools } from "@/server/modules/ai/ai-agent.service";

export const GET = apiRoute({ permission: ["ai_agent", "read"] }, ({ ctx }) => listAgentTools(ctx));
