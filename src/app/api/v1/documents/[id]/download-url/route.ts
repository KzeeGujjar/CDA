import { apiRoute } from "@/server/http/api-route";
import { getDocumentDownloadUrl } from "@/server/modules/files/files.service";

export const GET = apiRoute<{ id: string }>({ permission: ["documents", "read"] }, ({ ctx, params, query, meta }) =>
  getDocumentDownloadUrl(ctx, params.id, query, meta)
);
