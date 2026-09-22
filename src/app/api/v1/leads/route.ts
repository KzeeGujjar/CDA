import { apiRoute } from "@/server/http/api-route";
import { createLead, createLeadSchema, listLeads } from "@/server/modules/leads/leads.service";

export const GET = apiRoute({ permission: ["leads", "read"] }, ({ ctx, query }) => listLeads(ctx, query));

export const POST = apiRoute({ permission: ["leads", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await createLead(ctx, await body(createLeadSchema), meta), { status: 201 })
);
