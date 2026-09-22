import { apiRoute } from "@/server/http/api-route";
import { getBranch } from "@/server/modules/branches/branches.service";

export const GET = apiRoute<{ id: string }>({ permission: ["branches", "read"] }, ({ ctx, params }) =>
  getBranch(ctx, params.id)
);
