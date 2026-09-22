import { apiRoute } from "@/server/http/api-route";
import { getCustomer, updateCustomer, updateCustomerSchema } from "@/server/modules/customers/customers.service";

export const GET = apiRoute<{ id: string }>({ permission: ["customers", "read"] }, ({ ctx, params }) =>
  getCustomer(ctx, params.id)
);

export const PUT = apiRoute<{ id: string }>(
  { permission: ["customers", "update"] },
  async ({ ctx, params, body, meta }) => updateCustomer(ctx, params.id, await body(updateCustomerSchema), meta)
);
