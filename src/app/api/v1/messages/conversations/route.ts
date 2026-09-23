import { apiRoute } from "@/server/http/api-route";
import { createConversation, createConversationSchema, listConversations } from "@/server/modules/messages/messages.service";

export const GET = apiRoute({ permission: ["messages", "read"] }, ({ ctx, query }) => listConversations(ctx, query));

export const POST = apiRoute({ permission: ["messages", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await createConversation(ctx, await body(createConversationSchema), meta), { status: 201 })
);
