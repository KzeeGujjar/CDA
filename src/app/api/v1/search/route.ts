import { apiRouteV2 } from "@/server/http/api-route";
import { globalSearch } from "@/server/modules/search/search.service";

export const GET = apiRouteV2({ composed: true }, ({ ctx, query }) => globalSearch(ctx, query));
