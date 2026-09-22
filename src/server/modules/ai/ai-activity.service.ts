import { z } from "zod";
import type { AiActionType, AiActivityStatus } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { can, requirePermission } from "@/server/auth/authorize";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";

/**
 * The AI activity feed: what the AI did, on whose behalf, and whether a person still has to look at it.
 * Entries are written by the AI features themselves (recordAiActivity), never by a client, and hold a short
 * outcome, not the prompt or the answer: managers who can read the feed cannot read employees' chats.
 */

export const activityStatuses = ["completed", "in_progress", "needs_review", "failed"] as const;
export const activityActions = [
  "valuation",
  "lead_scoring",
  "marketing_content",
  "document_generation",
  "document_translation",
  "document_summary",
  "price_analysis",
  "chat_response",
  "follow_up_suggestion",
] as const;

export const activityQuerySchema = z.strictObject({
  status: z.enum(activityStatuses).optional(),
  action: z.enum(activityActions).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export const summaryQuerySchema = z.strictObject({ days: z.coerce.number().int().min(1).max(365).default(30) });
export const reviewSchema = z.strictObject({ outcome: z.enum(["approved", "rejected"]) });

const parse = <T>(schema: z.ZodType<T>, query: URLSearchParams): T => schema.parse(Object.fromEntries(query.entries()));
const up = (v: string) => v.toUpperCase() as never;

export interface ActivityDto {
  id: string;
  timestamp: string;
  action: string;
  /** Only shown to users who may read vehicles / customers. */
  vehicleLabel?: string;
  customerName?: string;
  result: string;
  status: string;
  timeSavedSeconds: number;
  reviewedAt: string | null;
}

export interface RecordActivityInput {
  action: AiActionType;
  status?: AiActivityStatus;
  summary: string;
  conversationId?: string;
  usageId?: string;
  vehicleId?: string;
  customerId?: string;
  timeSavedSeconds?: number;
}

/** Called by every AI feature inside its own tenant transaction, so the entry commits with the work it describes. */
export async function recordAiActivity(db: TenantDb, ctx: AuthContext, input: RecordActivityInput): Promise<string> {
  const row = await db.aiActivity.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: input.action,
      status: input.status ?? "COMPLETED",
      summary: input.summary.slice(0, 1000),
      conversationId: input.conversationId,
      usageId: input.usageId,
      vehicleId: input.vehicleId,
      customerId: input.customerId,
      timeSavedSeconds: input.timeSavedSeconds ?? 0,
    },
  });
  return row.id;
}

export async function listActivity(
  ctx: AuthContext,
  query: URLSearchParams
): Promise<{ items: ActivityDto[]; total: number }> {
  requirePermission(ctx, "ai_activity", "read");
  const q = parse(activityQuerySchema, query);
  const showVehicle = can(ctx, "vehicles", "read");
  const showCustomer = can(ctx, "customers", "read");
  const where = {
    ...(q.status ? { status: up(q.status) } : {}),
    ...(q.action ? { action: up(q.action) } : {}),
    ...(q.search ? { summary: { contains: q.search, mode: "insensitive" as const } } : {}),
  };
  return withTenant(ctx, async (db) => {
    const [rows, total] = await Promise.all([
      db.aiActivity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
        include: { vehicle: { select: { year: true, make: true, model: true } }, customer: { select: { name: true } } },
      }),
      db.aiActivity.count({ where }),
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        timestamp: r.createdAt.toISOString(),
        action: r.action.toLowerCase(),
        ...(showVehicle && r.vehicle ? { vehicleLabel: `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}` } : {}),
        ...(showCustomer && r.customer ? { customerName: r.customer.name } : {}),
        result: r.summary,
        status: r.status.toLowerCase(),
        timeSavedSeconds: r.timeSavedSeconds,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      })),
    };
  });
}

/** Matches the frontend AiActivitySummary. */
export async function getActivitySummary(ctx: AuthContext, query: URLSearchParams) {
  requirePermission(ctx, "ai_activity", "read");
  const { days } = parse(summaryQuerySchema, query);
  const since = new Date(Date.now() - days * 86_400_000);
  return withTenant(ctx, async (db) => {
    const groups = await db.aiActivity.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { timeSavedSeconds: true },
    });
    const count = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    const saved = groups
      .filter((g) => g.status === "COMPLETED")
      .reduce((n, g) => n + (g._sum.timeSavedSeconds ?? 0), 0);
    return {
      days,
      totalActions: groups.reduce((n, g) => n + g._count._all, 0),
      completed: count("COMPLETED"),
      needsReview: count("NEEDS_REVIEW"),
      failed: count("FAILED"),
      timeSavedHours: Math.round((saved / 3600) * 10) / 10,
    };
  });
}

/** A person accepts or rejects something the AI flagged. Only entries waiting for review can be reviewed. */
export async function reviewActivity(
  ctx: AuthContext,
  id: string,
  body: z.infer<typeof reviewSchema>,
  meta?: RequestMeta
): Promise<ActivityDto> {
  requirePermission(ctx, "ai_activity", "update");
  const row = await withTenant(ctx, async (db) => {
    const current = await db.aiActivity.findFirst({ where: { id } });
    if (!current) throw notFound("Activity not found.");
    if (current.status !== "NEEDS_REVIEW") throw badRequest("This entry is not waiting for review.", "not_reviewable");
    const updated = await db.aiActivity.update({
      where: { id },
      data: {
        status: body.outcome === "approved" ? "COMPLETED" : "FAILED",
        reviewedById: ctx.userId,
        reviewedAt: new Date(),
      },
    });
    await recordAudit(db, ctx, {
      action: "ai.activity.reviewed",
      entityType: "ai_activity",
      entityId: id,
      metadata: { outcome: body.outcome },
      ...meta,
    });
    return updated;
  });
  return {
    id: row.id,
    timestamp: row.createdAt.toISOString(),
    action: row.action.toLowerCase(),
    result: row.summary,
    status: row.status.toLowerCase(),
    timeSavedSeconds: row.timeSavedSeconds,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
