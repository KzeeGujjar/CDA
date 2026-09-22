import { apiRoute } from "@/server/http/api-route";
import { calculateProfitForRequest, calculateProfitSchema } from "@/server/modules/profit/profit.service";

export const POST = apiRoute({ permission: ["profit", "read"] }, async ({ ctx, body }) =>
  calculateProfitForRequest(ctx, await body(calculateProfitSchema))
);
