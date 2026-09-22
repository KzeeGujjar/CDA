import { apiRoute } from "@/server/http/api-route";
import { getLeadKpis } from "@/server/modules/dashboard/dashboard.service";

export const GET = apiRoute({ permission: ["leads", "read"] }, ({ ctx, query }) => getLeadKpis(ctx, query));
