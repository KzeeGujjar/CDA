import { apiRoute } from "@/server/http/api-route";
import { deleteRole, getRole } from "@/server/modules/rbac/roles.service";

export const GET = apiRoute<{ id: string }>({ permission: ["roles", "read"] }, ({ ctx, params }) =>
  getRole(ctx, params.id)
);

export const DELETE = apiRoute<{ id: string }>({ permission: ["roles", "manage"] }, ({ ctx, params, meta }) =>
  deleteRole(ctx, params.id, meta)
);
