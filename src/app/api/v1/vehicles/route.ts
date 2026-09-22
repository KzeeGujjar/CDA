import { apiRoute } from "@/server/http/api-route";
import { createVehicle, createVehicleSchema, listVehicles } from "@/server/modules/vehicles/vehicles.service";

export const GET = apiRoute({ permission: ["vehicles", "read"] }, ({ ctx, query }) => listVehicles(ctx, query));

export const POST = apiRoute({ permission: ["vehicles", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await createVehicle(ctx, await body(createVehicleSchema), meta), { status: 201 })
);
