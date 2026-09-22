import { apiRoute } from "@/server/http/api-route";
import { revokeInvitation } from "@/server/auth/flows/invitations";

export const DELETE = apiRoute<{ id: string }>({ permission: ["users", "create"] }, ({ ctx, params, meta }) =>
  revokeInvitation(ctx, params.id, meta)
);
