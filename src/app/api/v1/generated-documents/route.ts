import { apiRouteV2 } from "@/server/http/api-route";
import { createDocument, createDocumentSchema, listDocuments } from "@/server/modules/documents/documents.service";

// A different resource from GET/DELETE /api/v1/documents (uploaded document FILES, files.service.ts,
// §0.8): this one is server-generated business documents (quotations, agreements, ...) from a template.

export const GET = apiRouteV2({ permission: ["documents", "read"] }, async ({ ctx, query }) => {
  const { items, total } = await listDocuments(ctx, query);
  return { data: items, meta: { total } };
});

export const POST = apiRouteV2({ permission: ["documents", "create"] }, async ({ ctx, body, meta }) => {
  const created = await createDocument(ctx, await body(createDocumentSchema), meta);
  return Response.json({ success: true, data: created }, { status: 201 });
});
