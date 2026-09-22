import { apiRoute } from "@/server/http/api-route";
import { getMatrix, matrixSchema, updateMatrix } from "@/server/modules/rbac/roles.service";

export const GET = apiRoute({ permission: ["roles", "read"] }, ({ ctx }) => getMatrix(ctx));

export const PUT = apiRoute({ permission: ["roles", "manage"] }, async ({ ctx, body, meta }) =>
  updateMatrix(ctx, await body(matrixSchema), meta)
);
