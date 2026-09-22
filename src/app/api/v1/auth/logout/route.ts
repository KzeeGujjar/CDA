import { jsonResponse, publicRoute } from "@/server/http/api-route";
import { readCookie, serializeClearedSessionCookie, sessionCookieName } from "@/server/auth/cookies";
import { logout } from "@/server/auth/flows/logout";

export const POST = publicRoute(async ({ req, meta }) => {
  await logout(readCookie(req.headers.get("cookie"), sessionCookieName()), meta);
  return jsonResponse({ loggedOut: true }, { cookies: [serializeClearedSessionCookie()] });
});
