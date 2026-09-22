import { apiRoute } from "@/server/http/api-route";
import { setUserStatus, setUserStatusSchema } from "@/server/auth/flows/account-status";

export const PATCH = apiRoute<{ id: string }>(
  { permission: ["users", "update"] },
  async ({ ctx, params, body, meta }) => setUserStatus(ctx, params.id, await body(setUserStatusSchema), meta)
);
