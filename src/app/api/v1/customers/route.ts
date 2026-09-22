import { apiRoute } from "@/server/http/api-route";
import { createCustomer, createCustomerSchema, listCustomers } from "@/server/modules/customers/customers.service";

export const GET = apiRoute({ permission: ["customers", "read"] }, ({ ctx, query }) => listCustomers(ctx, query));

export const POST = apiRoute({ permission: ["customers", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await createCustomer(ctx, await body(createCustomerSchema), meta), { status: 201 })
);
