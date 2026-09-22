import { apiRoute } from "@/server/http/api-route";
import { assignRoleSchema, assignUserRole } from "@/server/modules/rbac/roles.service";

export const PATCH = apiRoute<{ id: string }>(
  { permission: ["users", "update"] },
  async ({ ctx, params, body, meta }) => assignUserRole(ctx, params.id, await body(assignRoleSchema), meta)
);
