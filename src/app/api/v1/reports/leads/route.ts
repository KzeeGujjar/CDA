import { apiRoute } from "@/server/http/api-route";
import { getLeadReport } from "@/server/modules/reports/reports.service";

export const GET = apiRoute({ permission: ["reports", "read"] }, ({ ctx }) => getLeadReport(ctx));
