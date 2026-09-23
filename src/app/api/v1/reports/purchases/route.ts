import { apiRoute } from "@/server/http/api-route";
import { getPurchaseReport } from "@/server/modules/reports/reports.service";

export const GET = apiRoute({ permission: ["reports", "read"], also: ["profit", "read"] }, ({ ctx }) =>
  getPurchaseReport(ctx)
);
