import { apiRoute } from "@/server/http/api-route";
import { getCatalog } from "@/server/modules/rbac/roles.service";

export const GET = apiRoute({ permission: ["roles", "read"] }, ({ ctx }) => getCatalog(ctx));
