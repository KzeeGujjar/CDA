import { apiRoute } from "@/server/http/api-route";
import { createTask, createTaskSchema } from "@/server/modules/tasks/tasks.service";

export const POST = apiRoute({ permission: ["tasks", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await createTask(ctx, await body(createTaskSchema), { source: "manual", meta }), { status: 201 })
);
