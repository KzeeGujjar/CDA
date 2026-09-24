import { z } from "zod";
import type { Notification, NotificationKind } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { notFound } from "@/server/lib/errors";

/**
 * Real notifications backend (§27). The table and its 8-kind enum already existed (§0.15, feeding the top-bar
 * bell) but nothing ever created a row except the task-reminder job, and nothing ever read one over HTTP — the
 * frontend's notification service ran entirely on demo data. `notifyUser` is now called from every module that
 * has a genuine trigger for one of the 8 named types (leads, vehicles, documents, the AI agent); see
 * docs/BACKEND_ARCHITECTURE.md §0.29 for which of the 8 fire for real and why the rest do not yet.
 *
 * Future channels (email, WhatsApp, push, SMS): `notifyUser` is the one seam every trigger already goes
 * through. Fanning a notification out to a real channel later is a change inside this one function (using the
 * same provider-adapter pattern §0.20's messaging module already established), never a change at any of the
 * call sites above — they only ever say "notify this user about this," never how.
 */

export const markNotificationReadSchema = z.strictObject({ read: z.literal(true) });

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  description: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const LIST_LIMIT = 50;

function toDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    kind: n.kind.toLowerCase(),
    title: n.title,
    description: n.description,
    link: n.link,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(ctx: AuthContext): Promise<NotificationDto[]> {
  return withTenant(ctx, async (db) => {
    const rows = await db.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });
    return rows.map(toDto);
  });
}

export async function markNotificationRead(ctx: AuthContext, id: string): Promise<NotificationDto> {
  return withTenant(ctx, async (db) => {
    const existing = await db.notification.findFirst({ where: { id, userId: ctx.userId } });
    if (!existing) throw notFound("Notification not found.");
    if (existing.readAt) return toDto(existing);
    const row = await db.notification.update({ where: { id }, data: { readAt: new Date() } });
    return toDto(row);
  });
}

export async function markAllNotificationsRead(ctx: AuthContext): Promise<{ updated: number }> {
  return withTenant(ctx, async (db) => {
    const result = await db.notification.updateMany({
      where: { userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  });
}

/**
 * Creates one real notification for one user, inside the caller's own tenant transaction (documents, vehicles,
 * leads) so it commits or rolls back with the change it is about — never a separate, possibly-orphaned write.
 * The AI agent executor is the one exception: it has no open transaction at its trigger point, so it wraps
 * this in its own withTenant().catch(() => undefined), matching how it already treats ai_activity/audit writes
 * as best-effort there.
 */
export async function notifyUser(
  db: TenantDb,
  ctx: AuthContext,
  input: { userId: string; kind: NotificationKind; title: string; description: string; link?: string }
): Promise<void> {
  await db.notification.create({
    data: {
      organizationId: ctx.organizationId,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      link: input.link,
    },
  });
}
