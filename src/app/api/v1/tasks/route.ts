import { apiRoute, apiRouteV2 } from "@/server/http/api-route";
import { createTask, createTaskSchema, listTasks } from "@/server/modules/tasks/tasks.service";

// GET is new (§0.24, v2 envelope); POST already existed (shared with the AI agent's createTask tool, and
// covered by check-ai-agent-http.ts / check-errors-http.ts on the flat envelope) and is left unchanged.

export const GET = apiRouteV2({ permission: ["tasks", "read"] }, async ({ ctx, query }) => {
  const { items, total } = await listTasks(ctx, query);
  return { data: items, meta: { total } };
});

export const POST = apiRoute({ permission: ["tasks", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await createTask(ctx, await body(createTaskSchema), { source: "manual", meta }), { status: 201 })
);
