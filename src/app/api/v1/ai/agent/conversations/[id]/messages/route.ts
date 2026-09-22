import { apiRoute } from "@/server/http/api-route";
import { agentMessageSchema, runAgentTurn } from "@/server/modules/ai/ai-agent.service";

export const POST = apiRoute<{ id: string }>(
  { permission: ["ai_agent", "create"] },
  async ({ ctx, params, body, meta }) => runAgentTurn(ctx, params.id, await body(agentMessageSchema), meta)
);
