import type { AuthContext } from "@/server/auth/context";
import { withTenant } from "@/server/db/tenant";
import { unauthorized } from "@/server/lib/errors";

export interface MeDto {
  user: { id: string; name: string; email: string; role: string; avatarUrl?: string };
  organization: {
    id: string;
    name: string;
    type: string;
    country: string;
    /** UAE emirate the dealership is in (null outside the UAE or when not recorded). */
    emirate: string | null;
    currency: string;
    timezone: string;
    locale: string;
  };
  branchIds: string[];
  /** "vehicles:read" -> "own" | "branch" | "organization". Lets the UI hide what the server would refuse. */
  permissions: Record<string, string>;
}

/** The caller's own identity, derived entirely from the session (no id is accepted from the client). */
export async function getMe(ctx: AuthContext): Promise<MeDto> {
  const { organization, user } = await withTenant(ctx, async (db) => ({
    organization: await db.organization.findUnique({ where: { id: ctx.organizationId } }),
    user: await db.user.findFirst({ where: { id: ctx.userId }, select: { avatar: true } }),
  }));
  if (!organization) throw unauthorized();

  return {
    user: {
      id: ctx.userId,
      name: ctx.userName,
      email: ctx.userEmail,
      role: ctx.roleKey,
      avatarUrl: user?.avatar ?? undefined,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      type: organization.type.toLowerCase(),
      country: organization.country,
      emirate: organization.emirate ? organization.emirate.toLowerCase() : null,
      currency: organization.currency,
      timezone: organization.timezone,
      locale: organization.locale,
    },
    branchIds: [...ctx.branchIds],
    permissions: Object.fromEntries(ctx.permissions),
  };
}
