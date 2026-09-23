import { apiRouteV2 } from "@/server/http/api-route";
import { shareDocument } from "@/server/modules/documents/documents.service";

export const POST = apiRouteV2<{ id: string }>({ permission: ["documents", "update"] }, ({ ctx, params, meta }) =>
  shareDocument(ctx, params.id, meta)
);
