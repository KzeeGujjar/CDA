import { apiRoute } from "@/server/http/api-route";
import { getSalesTrend } from "@/server/modules/dashboard/dashboard.service";

export const GET = apiRoute({ permission: ["sales", "read"] }, ({ ctx, query }) => getSalesTrend(ctx, query));
