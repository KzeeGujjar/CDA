import { z } from "zod";
import type { Branch } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { notFound } from "@/server/lib/errors";
import { emirateCodes } from "@/lib/uae/reference";
import { recordAudit } from "@/server/modules/audit/record";
import type { RequestMeta } from "@/server/http/api-route";

export const emirateValues = emirateCodes;

/** Note what is NOT here: no organizationId. Strict, so any extra key is a 400. */
export const createBranchSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(30).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
  city: z.string().trim().max(80).optional(),
  emirate: z.enum(emirateValues).optional(),
  isPrimary: z.boolean().optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export interface BranchDto {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  emirate: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
}

export function toBranchDto(b: Branch): BranchDto {
  return {
    id: b.id,
    name: b.name,
    code: b.code,
    phone: b.phone,
    address: b.address,
    city: b.city,
    emirate: b.emirate ? b.emirate.toLowerCase() : null,
    isPrimary: b.isPrimary,
    isActive: b.isActive,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function listBranches(ctx: AuthContext): Promise<BranchDto[]> {
  const scope = requirePermission(ctx, "branches", "read");
  const rows = await withTenant(ctx, (db) =>
    db.branch.findMany({
      // Narrow scopes only see the branches they are assigned to.
      where: scopeWhere(ctx, scope, { branchField: "id" }),
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    })
  );
  return rows.map(toBranchDto);
}

export async function getBranch(ctx: AuthContext, id: string): Promise<BranchDto> {
  const scope = requirePermission(ctx, "branches", "read");
  const row = await withTenant(ctx, (db) => db.branch.findFirst({ where: { id } }));
  // A branch in another organization is indistinguishable from one that does not exist.
  if (!row || !scopeAllows(ctx, scope, { branchField: "id" }, row)) throw notFound("Branch not found.");
  return toBranchDto(row);
}

export async function createBranch(ctx: AuthContext, input: CreateBranchInput, meta?: RequestMeta): Promise<BranchDto> {
  requirePermission(ctx, "branches", "create");
  return withTenant(ctx, async (db) => {
    if (input.isPrimary) await db.branch.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
    const created = await db.branch.create({
      data: {
        organizationId: ctx.organizationId, // from the session; the tenant extension re-verifies it
        name: input.name,
        code: input.code,
        phone: input.phone,
        address: input.address,
        city: input.city,
        emirate: input.emirate ? (input.emirate.toUpperCase() as Branch["emirate"]) : undefined,
        isPrimary: input.isPrimary ?? false,
      },
    });
    await recordAudit(db, ctx, {
      action: "branch.created",
      entityType: "branch",
      entityId: created.id,
      metadata: { name: created.name },
      ...meta,
    });
    return toBranchDto(created);
  });
}
