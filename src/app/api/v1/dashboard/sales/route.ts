import { apiRoute } from "@/server/http/api-route";
import { getSalesKpis } from "@/server/modules/dashboard/dashboard.service";

export const GET = apiRoute({ permission: ["sales", "read"] }, ({ ctx, query }) => getSalesKpis(ctx, query));
