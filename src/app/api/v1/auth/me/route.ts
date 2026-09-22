import { apiRoute } from "@/server/http/api-route";
import { getMe } from "@/server/modules/auth/me.service";

export const GET = apiRoute({ self: true }, ({ ctx }) => getMe(ctx));
