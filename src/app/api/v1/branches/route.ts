import { apiRoute } from "@/server/http/api-route";
import { createBranch, createBranchSchema, listBranches } from "@/server/modules/branches/branches.service";

export const GET = apiRoute({ permission: ["branches", "read"] }, ({ ctx }) => listBranches(ctx));

export const POST = apiRoute({ permission: ["branches", "create"] }, async ({ ctx, body, meta }) => {
  const created = await createBranch(ctx, await body(createBranchSchema), meta);
  return Response.json(created, { status: 201 });
});
