import { jsonResponse, publicRoute } from "@/server/http/api-route";
import { register, registerSchema } from "@/server/auth/flows/register";

export const POST = publicRoute(async ({ body, meta }) =>
  jsonResponse(await register(await body(registerSchema), meta), { status: 202 })
);
