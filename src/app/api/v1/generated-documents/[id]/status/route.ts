import { apiRouteV2 } from "@/server/http/api-route";
import { updateDocumentStatus, updateDocumentStatusSchema } from "@/server/modules/documents/documents.service";

export const PATCH = apiRouteV2<{ id: string }>({ permission: ["documents", "update"] }, async ({ ctx, params, body, meta }) =>
  updateDocumentStatus(ctx, params.id, await body(updateDocumentStatusSchema), meta)
);
