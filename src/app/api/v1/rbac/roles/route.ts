import { apiRoute, jsonResponse } from "@/server/http/api-route";
import { createRole, createRoleSchema, listRoles } from "@/server/modules/rbac/roles.service";

export const GET = apiRoute({ permission: ["roles", "read"] }, ({ ctx }) => listRoles(ctx));

export const POST = apiRoute({ permission: ["roles", "manage"] }, async ({ ctx, body, meta }) =>
  jsonResponse(await createRole(ctx, await body(createRoleSchema), meta), { status: 201 })
);
