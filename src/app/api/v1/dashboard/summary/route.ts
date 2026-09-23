import { apiRoute } from "@/server/http/api-route";
import { getDashboardSummary } from "@/server/modules/dashboard/dashboard.service";

export const GET = apiRoute({ composed: true }, ({ ctx, query }) => getDashboardSummary(ctx, query));
