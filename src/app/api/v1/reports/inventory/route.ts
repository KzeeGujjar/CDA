import { apiRoute } from "@/server/http/api-route";
import { getInventoryReport } from "@/server/modules/reports/reports.service";

export const GET = apiRoute({ permission: ["reports", "read"] }, ({ ctx }) => getInventoryReport(ctx));
