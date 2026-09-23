import { apiRoute } from "@/server/http/api-route";
import { getSalespersonPerformanceReport } from "@/server/modules/reports/reports.service";

export const GET = apiRoute({ permission: ["reports", "read"] }, ({ ctx }) => getSalespersonPerformanceReport(ctx));
