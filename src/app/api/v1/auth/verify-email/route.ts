import { publicRoute } from "@/server/http/api-route";
import { verifyEmail, verifyEmailSchema } from "@/server/auth/flows/verify-email";

export const POST = publicRoute(async ({ body, meta }) => verifyEmail(await body(verifyEmailSchema), meta));
