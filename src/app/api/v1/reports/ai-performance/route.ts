import { apiRoute } from "@/server/http/api-route";
import { getAiPerformanceReport } from "@/server/modules/reports/reports.service";

export const GET = apiRoute({ permission: ["reports", "read"] }, ({ ctx }) => getAiPerformanceReport(ctx));
