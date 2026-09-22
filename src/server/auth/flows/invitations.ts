import { z } from "zod";
import type { AuthContext } from "../context";
import { requirePermission } from "../authorize";
import { getPlatformDb } from "@/server/db/clients";
import { withTenant } from "@/server/db/tenant";
import { badRequest, conflict, forbidden, notFound, weakPassword } from "@/server/lib/errors";
import { defer } from "@/server/lib/defer";
import { sendEmail } from "@/server/email/transport";
import { accountAlreadyExistsMessage, invitationMessage } from "@/server/email/templates";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { assertAcceptablePassword, hashPassword } from "../password";
import { enforce, LIMITS } from "../rate-limit";
import { createSession } from "../session";
import { generateToken, hashToken, INVITATION_TTL_MS, looksLikeToken } from "../tokens";
import { auditAuth, describeDevice, emailSchema, nameSchema, passwordInputSchema, rateLimitIp } from "./common";
import type { LoginResult } from "./login";

export const createInvitationSchema = z.strictObject({ email: emailSchema, roleId: z.string().min(1).max(40) });
export const acceptInvitationSchema = z.strictObject({
  token: z.string().min(1).max(200),
  name: nameSchema,
  password: passwordInputSchema,
});

export interface InvitationDto {
  id: string;
  email: string;
  role: { id: string; key: string; name: string };
  status: string;
  expiresAt: string;
  createdAt: string;
}

const toDto = (i: {
  id: string;
  email: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  role: { id: string; key: string; name: string };
}): InvitationDto => ({
  id: i.id,
  email: i.email,
  role: i.role,
  status: i.status.toLowerCase(),
  expiresAt: i.expiresAt.toISOString(),
  createdAt: i.createdAt.toISOString(),
});

const roleSelect = { select: { id: true, key: true, name: true } } as const;

/**
 * Invite someone to the caller's organization. The organization comes from the session; the role must
 * belong to it and must not outrank the inviter. Whether the address already has an account elsewhere is
 * decided only when the email is sent, so the API response never reveals another organization's users.
 */
export async function createInvitation(
  ctx: AuthContext,
  input: z.infer<typeof createInvitationSchema>,
  meta: RequestMeta
): Promise<InvitationDto> {
  requirePermission(ctx, "users", "create");
  const platform = getPlatformDb();
  await enforce(platform, [LIMITS.invite(ctx.userId)]);

  const token = generateToken();
  const { invitation, roleName, organizationName } = await withTenant(ctx, async (db) => {
    const role = await db.role.findFirst({ where: { id: input.roleId } });
    if (!role) throw notFound("Role not found.");
    if (role.rank > ctx.roleRank)
      throw forbidden("You cannot invite someone to a role above your own.", "role_rank_exceeded");

    const member = await db.user.findFirst({ where: { email: input.email }, select: { id: true } });
    if (member) throw conflict("This person is already a member of your organization.", "already_member");

    // A new invitation replaces any earlier pending one for the same address.
    await db.invitation.updateMany({ where: { email: input.email, status: "PENDING" }, data: { status: "REVOKED" } });
    const created = await db.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        email: input.email,
        roleId: role.id,
        invitedById: ctx.userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      include: { role: roleSelect },
    });
    const organization = await db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });
    await recordAudit(db, ctx, {
      action: "invitation.created",
      entityType: "invitation",
      entityId: created.id,
      metadata: { role: role.key },
      ...meta,
    });
    return { invitation: created, roleName: role.name, organizationName: organization?.name ?? "your organization" };
  });

  defer(async () => {
    const existsElsewhere = await platform.user.findUnique({ where: { email: input.email }, select: { id: true } });
    await sendEmail(
      existsElsewhere
        ? accountAlreadyExistsMessage(input.email)
        : invitationMessage(input.email, organizationName, ctx.userName, roleName, token)
    );
  });
  return toDto(invitation);
}

export async function listInvitations(ctx: AuthContext): Promise<InvitationDto[]> {
  requirePermission(ctx, "users", "read");
  const rows = await withTenant(ctx, (db) =>
    db.invitation.findMany({
      where: { status: "PENDING", expiresAt: { gt: new Date() } },
      include: { role: roleSelect },
      orderBy: { createdAt: "desc" },
    })
  );
  return rows.map(toDto);
}

export async function revokeInvitation(ctx: AuthContext, id: string, meta: RequestMeta): Promise<{ revoked: true }> {
  requirePermission(ctx, "users", "create");
  await withTenant(ctx, async (db) => {
    const result = await db.invitation.updateMany({ where: { id, status: "PENDING" }, data: { status: "REVOKED" } });
    if (result.count !== 1) throw notFound("Invitation not found.");
    await recordAudit(db, ctx, { action: "invitation.revoked", entityType: "invitation", entityId: id, ...meta });
  });
  return { revoked: true };
}

/**
 * Accept an invitation (public, token-authenticated). Creates the user in the INVITING organization with
 * the invited role; the email address is fixed by the invitation and already proven by the link, so the
 * account starts ACTIVE and verified. Single use, enforced atomically.
 */
export async function acceptInvitation(
  input: z.infer<typeof acceptInvitationSchema>,
  meta: RequestMeta
): Promise<LoginResult> {
  const db = getPlatformDb();
  await enforce(db, [LIMITS.tokenIp(rateLimitIp(meta))]);
  const invalid = () => badRequest("This invitation is invalid or has expired.", "invalid_or_expired_token");
  if (!looksLikeToken(input.token)) throw invalid();

  const now = new Date();
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { organization: true, role: true },
  });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= now) throw invalid();
  if (invitation.organization.status !== "ACTIVE" || invitation.organization.deletedAt) throw invalid();

  const problems = await assertAcceptablePassword(input.password, { email: invitation.email, name: input.name });
  if (problems.length) throw weakPassword(problems);
  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    userId = await db.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "ACCEPTED", acceptedAt: now },
      });
      if (claimed.count !== 1) throw invalid();

      const user = await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          roleId: invitation.roleId,
          name: input.name,
          email: invitation.email,
          passwordHash,
          passwordChangedAt: now,
          emailVerifiedAt: now,
          status: "ACTIVE",
        },
      });
      const primary = await tx.branch.findFirst({
        where: { organizationId: invitation.organizationId, isPrimary: true },
      });
      if (primary) {
        await tx.userBranch.create({
          data: { userId: user.id, branchId: primary.id, organizationId: invitation.organizationId, isPrimary: true },
        });
      }
      return user.id;
    });
  } catch (error) {
    // The address was registered in the meantime: the invitation stays unused and this looks like any invalid link.
    if ((error as { code?: string } | null)?.code === "P2002") throw invalid();
    throw error;
  }

  const session = await createSession(db, {
    organizationId: invitation.organizationId,
    userId,
    userAgent: meta.userAgent?.slice(0, 300),
    ipAddress: meta.ipAddress && /^[0-9a-fA-F:.]+$/.test(meta.ipAddress) ? meta.ipAddress : undefined,
    device: describeDevice(meta.userAgent),
  });
  await auditAuth(db, {
    organizationId: invitation.organizationId,
    userId,
    userName: input.name,
    action: "invitation.accepted",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: { role: invitation.role.key },
    meta,
  });

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: userId, name: input.name, email: invitation.email, role: invitation.role.key },
    organization: {
      id: invitation.organization.id,
      name: invitation.organization.name,
      type: invitation.organization.type.toLowerCase(),
      country: invitation.organization.country,
      currency: invitation.organization.currency,
      timezone: invitation.organization.timezone,
      locale: invitation.organization.locale,
    },
  };
}
