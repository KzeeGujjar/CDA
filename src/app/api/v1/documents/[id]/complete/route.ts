import { apiRoute } from "@/server/http/api-route";
import { completeDocumentUpload } from "@/server/modules/files/files.service";

export const POST = apiRoute<{ id: string }>({ permission: ["documents", "create"] }, ({ ctx, params, meta }) =>
  completeDocumentUpload(ctx, params.id, meta)
);
