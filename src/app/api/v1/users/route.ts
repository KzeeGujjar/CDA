import { apiRoute } from "@/server/http/api-route";
import { listUsers } from "@/server/modules/users/users.service";

export const GET = apiRoute({ permission: ["users", "read"] }, ({ ctx }) => listUsers(ctx));
