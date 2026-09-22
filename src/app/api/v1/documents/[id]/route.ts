import { apiRoute } from "@/server/http/api-route";
import { deleteDocument } from "@/server/modules/files/files.service";

export const DELETE = apiRoute<{ id: string }>({ permission: ["documents", "delete"] }, ({ ctx, params, meta }) =>
  deleteDocument(ctx, params.id, meta)
);
