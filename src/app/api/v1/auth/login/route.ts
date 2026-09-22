import { jsonResponse, publicRoute } from "@/server/http/api-route";
import { serializeSessionCookie } from "@/server/auth/cookies";
import { login, loginSchema } from "@/server/auth/flows/login";

/** The session token travels ONLY in an httpOnly cookie; it is never in the response body. */
export const POST = publicRoute(async ({ body, meta }) => {
  const result = await login(await body(loginSchema), meta);
  return jsonResponse(
    { user: result.user, organization: result.organization, expiresAt: result.expiresAt.toISOString() },
    { cookies: [serializeSessionCookie(result.token)] }
  );
});
