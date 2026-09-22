import { apiRoute } from "@/server/http/api-route";
import { listCurrencies } from "@/server/modules/reference/reference.service";

export const GET = apiRoute({ self: true }, ({ ctx }) => listCurrencies(ctx));
