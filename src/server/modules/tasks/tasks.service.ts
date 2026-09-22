import { z } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { forbidden, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { recordAudit } from "@/server/modules/audit/record";
import { loadRecordContext, type RecordType } from "@/server/modules/ai/record-context";

/**
 * Tasks. Used by the REST endpoint (POST /tasks) and by the AI agent's createTask tool, so both go through
 * the same permission, scope and validation rules. The organization always comes from the session.
 */
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "is not a valid id");

export const taskCategories = [
  "follow_up",
  "inspection",
  "photography",
  "documents",
  "call",
  "quotation",
  "service",
  "delivery",
] as const;
export const taskPriorities = ["low", "medium", "high"] as const;

export const createTaskSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  category: z.enum(taskCategories).default("follow_up"),
  priority: z.enum(taskPriorities).default("medium"),
  dueAt: z.iso.datetime({ offset: true }),
  /** Who does it. Defaults to the caller. Someone with only "own" task scope can assign to themselves only. */
  assignedToId: idSchema.optional(),
  /** The one record the task is about. */
  context: z.strictObject({ type: z.enum(["vehicle", "customer", "lead", "deal"]), id: idSchema }).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  dueAt: string;
  assignedToId: string | null;
  assignedToName: string | null;
  context: { type: RecordType; id: string } | null;
  source: string;
  createdAt: string;
}

export async function createTask(
  ctx: AuthContext,
  input: CreateTaskInput,
  options: { source?: "manual" | "ai_agent"; meta?: RequestMeta } = {}
): Promise<TaskDto> {
  const scope = requirePermission(ctx, "tasks", "create");
  const assigneeId = input.assignedToId ?? ctx.userId;
  if (assigneeId !== ctx.userId && scope === "own") {
    throw forbidden("You can only create tasks for yourself.");
  }
  const source = options.source ?? "manual";
  return withTenant(ctx, async (db) => {
    const assignee = await db.user.findFirst({
      where: { id: assigneeId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true },
    });
    // A user of another organization is indistinguishable from one that does not exist.
    if (!assignee) throw notFound("The person to assign the task to was not found.");
    // The record must exist in this organization and be visible to the caller (same rules as reading it).
    if (input.context) await loadRecordContext(ctx, db, input.context.type, input.context.id);
    const row = await db.task.create({
      data: {
        organizationId: ctx.organizationId,
        title: input.title,
        description: input.description,
        category: input.category.toUpperCase() as never,
        priority: input.priority.toUpperCase() as never,
        dueAt: new Date(input.dueAt),
        assignedToId: assignee.id,
        createdById: ctx.userId,
        source,
        ...(input.context?.type === "vehicle" ? { vehicleId: input.context.id } : {}),
        ...(input.context?.type === "customer" ? { customerId: input.context.id } : {}),
        ...(input.context?.type === "lead" ? { leadId: input.context.id } : {}),
        ...(input.context?.type === "deal" ? { dealId: input.context.id } : {}),
      },
    });
    await recordAudit(db, ctx, {
      action: "task.created",
      entityType: "task",
      entityId: row.id,
      metadata: { source, category: input.category, assignedToSelf: assignee.id === ctx.userId },
      ...options.meta,
    });
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category.toLowerCase(),
      status: row.status.toLowerCase(),
      priority: row.priority.toLowerCase(),
      dueAt: row.dueAt.toISOString(),
      assignedToId: assignee.id,
      assignedToName: assignee.name,
      context: input.context ?? null,
      source,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
