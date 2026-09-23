import { apiRouteV2 } from "@/server/http/api-route";
import { deleteTask, getTaskById, updateTask, updateTaskSchema } from "@/server/modules/tasks/tasks.service";

export const GET = apiRouteV2<{ id: string }>({ permission: ["tasks", "read"] }, ({ ctx, params }) =>
  getTaskById(ctx, params.id)
);

export const PATCH = apiRouteV2<{ id: string }>({ permission: ["tasks", "update"] }, async ({ ctx, params, body, meta }) =>
  updateTask(ctx, params.id, await body(updateTaskSchema), meta)
);

export const DELETE = apiRouteV2<{ id: string }>({ permission: ["tasks", "delete"] }, ({ ctx, params, meta }) =>
  deleteTask(ctx, params.id, meta)
);
