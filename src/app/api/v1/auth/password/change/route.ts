import { apiRoute } from "@/server/http/api-route";
import { changePassword, changePasswordSchema } from "@/server/auth/flows/change-password";

export const POST = apiRoute({ self: true }, async ({ ctx, body, meta }) =>
  changePassword(ctx, await body(changePasswordSchema), meta)
);
