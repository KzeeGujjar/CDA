import { apiRouteV2 } from "@/server/http/api-route";
import { updateTaskStatus, updateTaskStatusSchema } from "@/server/modules/tasks/tasks.service";

export const PATCH = apiRouteV2<{ id: string }>({ permission: ["tasks", "update"] }, async ({ ctx, params, body, meta }) =>
  updateTaskStatus(ctx, params.id, await body(updateTaskStatusSchema), meta)
);
