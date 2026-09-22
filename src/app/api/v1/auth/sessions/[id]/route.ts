import { apiRoute } from "@/server/http/api-route";
import { revokeMySession } from "@/server/auth/flows/sessions";

export const DELETE = apiRoute<{ id: string }>({ self: true }, ({ ctx, params, meta }) =>
  revokeMySession(ctx, params.id, meta)
);
