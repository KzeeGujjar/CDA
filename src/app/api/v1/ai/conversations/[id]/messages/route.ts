import { apiRoute } from "@/server/http/api-route";
import { sendMessage, sendMessageSchema } from "@/server/modules/ai/ai-conversations.service";

export const POST = apiRoute<{ id: string }>(
  { permission: ["ai_agent", "create"] },
  async ({ ctx, params, body, meta }) => sendMessage(ctx, params.id, await body(sendMessageSchema), meta)
);
