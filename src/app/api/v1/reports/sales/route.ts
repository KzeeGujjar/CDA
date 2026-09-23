import { apiRoute } from "@/server/http/api-route";
import { getSalesReport } from "@/server/modules/reports/reports.service";

export const GET = apiRoute({ permission: ["reports", "read"] }, ({ ctx }) => getSalesReport(ctx));
