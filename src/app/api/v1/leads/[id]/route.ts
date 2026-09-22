import { apiRoute } from "@/server/http/api-route";
import { getLead, updateLead, updateLeadSchema } from "@/server/modules/leads/leads.service";

export const GET = apiRoute<{ id: string }>({ permission: ["leads", "read"] }, ({ ctx, params }) =>
  getLead(ctx, params.id)
);

export const PUT = apiRoute<{ id: string }>({ permission: ["leads", "update"] }, async ({ ctx, params, body, meta }) =>
  updateLead(ctx, params.id, await body(updateLeadSchema), meta)
);
