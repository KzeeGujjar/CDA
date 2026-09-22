import { apiRoute } from "@/server/http/api-route";
import {
  createConversation,
  createConversationSchema,
  listConversations,
} from "@/server/modules/ai/ai-conversations.service";

export const GET = apiRoute({ permission: ["ai_agent", "read"] }, ({ ctx, query }) => listConversations(ctx, query));

export const POST = apiRoute({ permission: ["ai_agent", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await createConversation(ctx, await body(createConversationSchema), meta), { status: 201 })
);
