import { apiRoute } from "@/server/http/api-route";
import { getVehicle, updateVehicle, updateVehicleSchema } from "@/server/modules/vehicles/vehicles.service";

export const GET = apiRoute<{ id: string }>({ permission: ["vehicles", "read"] }, ({ ctx, params }) =>
  getVehicle(ctx, params.id)
);

export const PUT = apiRoute<{ id: string }>(
  { permission: ["vehicles", "update"] },
  async ({ ctx, params, body, meta }) => updateVehicle(ctx, params.id, await body(updateVehicleSchema), meta)
);
