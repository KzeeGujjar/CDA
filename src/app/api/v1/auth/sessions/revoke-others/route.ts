import { apiRoute } from "@/server/http/api-route";
import { revokeOtherSessions } from "@/server/auth/flows/sessions";

export const POST = apiRoute({ self: true }, ({ ctx, meta }) => revokeOtherSessions(ctx, meta));
