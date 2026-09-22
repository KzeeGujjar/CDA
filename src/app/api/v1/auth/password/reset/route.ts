import { publicRoute } from "@/server/http/api-route";
import { resetPassword, resetPasswordSchema } from "@/server/auth/flows/password-reset";

export const POST = publicRoute(async ({ body, meta }) => resetPassword(await body(resetPasswordSchema), meta));
