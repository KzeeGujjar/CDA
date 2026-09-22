import { apiRoute, jsonResponse } from "@/server/http/api-route";
import { createInvitation, createInvitationSchema, listInvitations } from "@/server/auth/flows/invitations";

export const GET = apiRoute({ permission: ["users", "read"] }, ({ ctx }) => listInvitations(ctx));

export const POST = apiRoute({ permission: ["users", "create"] }, async ({ ctx, body, meta }) =>
  jsonResponse(await createInvitation(ctx, await body(createInvitationSchema), meta), { status: 201 })
);
