import { apiRoute } from "@/server/http/api-route";
import { listMySessions } from "@/server/auth/flows/sessions";

export const GET = apiRoute({ self: true }, ({ ctx }) => listMySessions(ctx));
