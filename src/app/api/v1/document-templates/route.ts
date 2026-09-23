import { apiRouteV2 } from "@/server/http/api-route";
import { createTemplate, createTemplateSchema, listTemplates } from "@/server/modules/documents/documents.service";

export const GET = apiRouteV2({ permission: ["documents", "read"] }, ({ ctx, query }) => listTemplates(ctx, query));

export const POST = apiRouteV2({ permission: ["documents", "create"] }, async ({ ctx, body, meta }) => {
  const created = await createTemplate(ctx, await body(createTemplateSchema), meta);
  return Response.json({ success: true, data: created }, { status: 201 });
});
