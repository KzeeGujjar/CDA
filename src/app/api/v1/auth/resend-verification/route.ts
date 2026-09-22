import { jsonResponse, publicRoute } from "@/server/http/api-route";
import { resendVerification, resendVerificationSchema } from "@/server/auth/flows/verify-email";

export const POST = publicRoute(async ({ body, meta }) =>
  jsonResponse(await resendVerification(await body(resendVerificationSchema), meta), { status: 202 })
);
