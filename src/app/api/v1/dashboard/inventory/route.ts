import { apiRoute } from "@/server/http/api-route";
import { getInventoryKpis } from "@/server/modules/dashboard/dashboard.service";

export const GET = apiRoute({ permission: ["vehicles", "read"] }, ({ ctx, query }) => getInventoryKpis(ctx, query));
