import { apiRoute } from "@/server/http/api-route";
import {
  deleteConversation,
  getConversation,
  updateConversation,
  updateConversationSchema,
} from "@/server/modules/ai/ai-conversations.service";

export const GET = apiRoute<{ id: string }>({ permission: ["ai_agent", "read"] }, ({ ctx, params }) =>
  getConversation(ctx, params.id)
);

export const PATCH = apiRoute<{ id: string }>({ permission: ["ai_agent", "create"] }, async ({ ctx, params, body }) =>
  updateConversation(ctx, params.id, await body(updateConversationSchema))
);

export const DELETE = apiRoute<{ id: string }>({ permission: ["ai_agent", "create"] }, ({ ctx, params, meta }) =>
  deleteConversation(ctx, params.id, meta)
);
