import { apiRoute } from "@/server/http/api-route";
import { setPermissionsSchema, setRolePermissions } from "@/server/modules/rbac/roles.service";

export const PUT = apiRoute<{ id: string }>({ permission: ["roles", "manage"] }, async ({ ctx, params, body, meta }) =>
  setRolePermissions(ctx, params.id, await body(setPermissionsSchema), meta)
);
