import { apiRoute } from "@/server/http/api-route";
import { convertCurrency, convertQuerySchema } from "@/server/modules/reference/reference.service";

export const GET = apiRoute({ self: true }, ({ ctx, query }) =>
  convertCurrency(ctx, convertQuerySchema.parse(Object.fromEntries(query.entries())))
);
