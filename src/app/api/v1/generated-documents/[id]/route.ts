import { apiRouteV2 } from "@/server/http/api-route";
import { getDocumentById, updateDocument, updateDocumentSchema } from "@/server/modules/documents/documents.service";

export const GET = apiRouteV2<{ id: string }>({ permission: ["documents", "read"] }, ({ ctx, params }) =>
  getDocumentById(ctx, params.id)
);

export const PATCH = apiRouteV2<{ id: string }>({ permission: ["documents", "update"] }, async ({ ctx, params, body, meta }) =>
  updateDocument(ctx, params.id, await body(updateDocumentSchema), meta)
);
