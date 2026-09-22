import { jsonResponse, publicRoute } from "@/server/http/api-route";
import { serializeSessionCookie } from "@/server/auth/cookies";
import { acceptInvitation, acceptInvitationSchema } from "@/server/auth/flows/invitations";

export const POST = publicRoute(async ({ body, meta }) => {
  const result = await acceptInvitation(await body(acceptInvitationSchema), meta);
  return jsonResponse(
    { user: result.user, organization: result.organization, expiresAt: result.expiresAt.toISOString() },
    { status: 201, cookies: [serializeSessionCookie(result.token)] }
  );
});
