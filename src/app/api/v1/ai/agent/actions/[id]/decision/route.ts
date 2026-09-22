import { apiRoute } from "@/server/http/api-route";
import { decideAction, decisionSchema } from "@/server/modules/ai/ai-agent.service";

export const POST = apiRoute<{ id: string }>(
  { permission: ["ai_agent", "create"] },
  async ({ ctx, params, body, meta }) => decideAction(ctx, params.id, await body(decisionSchema), meta)
);
