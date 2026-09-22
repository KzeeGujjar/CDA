import { jsonResponse, publicRoute } from "@/server/http/api-route";
import { forgotPasswordSchema, requestPasswordReset } from "@/server/auth/flows/password-reset";

export const POST = publicRoute(async ({ body, meta }) =>
  jsonResponse(await requestPasswordReset(await body(forgotPasswordSchema), meta), { status: 202 })
);
