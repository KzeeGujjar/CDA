import { apiRoute } from "@/server/http/api-route";
import { getVehicleProfit, vehicleProfitSchema } from "@/server/modules/profit/profit.service";

export const POST = apiRoute<{ id: string }>(
  { permission: ["profit", "read"], also: ["vehicles", "read"] },
  async ({ ctx, params, body }) => getVehicleProfit(ctx, params.id, await body(vehicleProfitSchema))
);
