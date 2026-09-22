import { apiRoute } from "@/server/http/api-route";
import { getUser } from "@/server/modules/users/users.service";

export const GET = apiRoute<{ id: string }>({ permission: ["users", "read"] }, ({ ctx, params }) =>
  getUser(ctx, params.id)
);
