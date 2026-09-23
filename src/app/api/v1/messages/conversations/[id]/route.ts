import { apiRoute } from "@/server/http/api-route";
import { getConversation, markConversationRead, updateConversationSchema } from "@/server/modules/messages/messages.service";

export const GET = apiRoute<{ id: string }>({ permission: ["messages", "read"] }, ({ ctx, params }) =>
  getConversation(ctx, params.id)
);

export const PATCH = apiRoute<{ id: string }>({ permission: ["messages", "update"] }, async ({ ctx, params, body, meta }) => {
  await body(updateConversationSchema);
  return markConversationRead(ctx, params.id, meta);
});
