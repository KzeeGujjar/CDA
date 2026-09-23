import { apiRoute } from "@/server/http/api-route";
import { listMessages, sendMessage, sendMessageSchema } from "@/server/modules/messages/messages.service";

export const GET = apiRoute<{ id: string }>({ permission: ["messages", "read"] }, ({ ctx, params }) =>
  listMessages(ctx, params.id)
);

export const POST = apiRoute<{ id: string }>({ permission: ["messages", "create"] }, async ({ ctx, params, body, meta }) =>
  Response.json(await sendMessage(ctx, params.id, await body(sendMessageSchema), meta), { status: 201 })
);
