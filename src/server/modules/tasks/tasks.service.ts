import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
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

/**
 * List/get/update/status/delete (§0.23: real task management, built from §0.24 onward — see the route files
 * for which envelope each one uses). createTask above is untouched: it is shared with the AI agent's
 * createTask tool and already covered by check-ai-agent-http.ts / check-errors-http.ts on the flat envelope.
 */

export const taskStatusValues = ["open", "completed"] as const;

export const listTasksQuerySchema = z.strictObject({
  status: z.enum(taskStatusValues).optional(),
  category: z.enum(taskCategories).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const updateTaskSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    category: z.enum(taskCategories).optional(),
    priority: z.enum(taskPriorities).optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    assignedToId: idSchema.optional(),
    /** Null clears the reminder; a datetime sets/replaces it (and un-marks it as already reminded). */
    remindAt: z.iso.datetime({ offset: true }).nullable().optional(),
    context: z.strictObject({ type: z.enum(["vehicle", "customer", "lead", "deal"]), id: idSchema }).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskStatusSchema = z.strictObject({ status: z.enum(taskStatusValues) });

export interface TaskListDto {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  dueAt: string;
  assignedToId: string | null;
  assignedToName: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  dealId: string | null;
  dealReference: string | null;
  remindAt: string | null;
  createdAt: string;
  completedAt: string | null;
}
export interface TaskActivityDto {
  id: string;
  action: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface TaskDetailDto extends TaskListDto {
  activity: TaskActivityDto[];
}

const taskRowInclude = {
  assignedTo: { select: { name: true } },
  vehicle: { select: { year: true, make: true, model: true, trim: true } },
  customer: { select: { name: true } },
  deal: { select: { reference: true } },
} as const;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskRowInclude }>;

function toTaskListDto(row: TaskRow): TaskListDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category.toLowerCase(),
    status: row.status.toLowerCase(),
    priority: row.priority.toLowerCase(),
    dueAt: row.dueAt.toISOString(),
    assignedToId: row.assignedToId,
    assignedToName: row.assignedTo?.name ?? null,
    vehicleId: row.vehicleId,
    vehicleLabel: row.vehicle ? `${row.vehicle.year} ${row.vehicle.make} ${row.vehicle.model}${row.vehicle.trim ? ` ${row.vehicle.trim}` : ""}` : null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    dealId: row.dealId,
    dealReference: row.deal?.reference ?? null,
    remindAt: row.remindAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

const parseQuery = <T>(schema: z.ZodType<T>, query: URLSearchParams): T => schema.parse(Object.fromEntries(query.entries()));

export async function listTasks(ctx: AuthContext, query: URLSearchParams): Promise<{ items: TaskListDto[]; total: number }> {
  const scope = requirePermission(ctx, "tasks", "read");
  const q = parseQuery(listTasksQuerySchema, query);
  const where: Prisma.TaskWhereInput = {
    AND: [
      scopeWhere(ctx, scope, { ownerField: "assignedToId" }) as Prisma.TaskWhereInput,
      q.status ? { status: q.status.toUpperCase() as never } : {},
      q.category ? { category: q.category.toUpperCase() as never } : {},
    ],
  };
  return withTenant(ctx, async (db) => {
    const [rows, total] = await Promise.all([
      db.task.findMany({ where, include: taskRowInclude, orderBy: { dueAt: "asc" }, take: q.limit, skip: q.offset }),
      db.task.count({ where }),
    ]);
    return { items: rows.map(toTaskListDto), total };
  });
}

export async function getTaskById(ctx: AuthContext, id: string): Promise<TaskDetailDto> {
  const scope = requirePermission(ctx, "tasks", "read");
  return withTenant(ctx, async (db) => {
    const row = await db.task.findFirst({ where: { id }, include: taskRowInclude });
    if (!row || !scopeAllows(ctx, scope, { ownerField: "assignedToId" }, row)) throw notFound("Task not found.");
    const audit = await db.auditLog.findMany({
      where: { entityType: "task", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      ...toTaskListDto(row),
      activity: audit.map((a) => ({
        id: a.id,
        action: a.action,
        actorName: a.actorName,
        metadata: a.metadata as Record<string, unknown>,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });
}

export async function updateTask(
  ctx: AuthContext,
  id: string,
  patch: UpdateTaskInput,
  meta?: RequestMeta
): Promise<TaskDetailDto> {
  const scope = requirePermission(ctx, "tasks", "update");
  return withTenant(ctx, async (db) => {
    const existing = await db.task.findFirst({ where: { id } });
    if (!existing || !scopeAllows(ctx, scope, { ownerField: "assignedToId" }, existing)) throw notFound("Task not found.");

    if (patch.assignedToId && patch.assignedToId !== existing.assignedToId && scope === "own") {
      throw forbidden("You can only reassign a task to yourself.");
    }
    let assignee: { id: string } | null = null;
    if (patch.assignedToId) {
      assignee = await db.user.findFirst({ where: { id: patch.assignedToId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (!assignee) throw notFound("The person to assign the task to was not found.");
    }
    if (patch.context) await loadRecordContext(ctx, db, patch.context.type, patch.context.id);

    const row = await db.task.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.category !== undefined ? { category: patch.category.toUpperCase() as never } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority.toUpperCase() as never } : {}),
        ...(patch.dueAt !== undefined ? { dueAt: new Date(patch.dueAt) } : {}),
        ...(assignee ? { assignedToId: assignee.id } : {}),
        ...(patch.remindAt !== undefined ? { remindAt: patch.remindAt ? new Date(patch.remindAt) : null, remindedAt: null } : {}),
        ...(patch.context !== undefined
          ? {
              vehicleId: patch.context?.type === "vehicle" ? patch.context.id : null,
              customerId: patch.context?.type === "customer" ? patch.context.id : null,
              leadId: patch.context?.type === "lead" ? patch.context.id : null,
              dealId: patch.context?.type === "deal" ? patch.context.id : null,
            }
          : {}),
      },
      include: taskRowInclude,
    });
    await recordAudit(db, ctx, { action: "task.updated", entityType: "task", entityId: id, metadata: { fields: Object.keys(patch).join(",") }, ...meta });
    const audit = await db.auditLog.findMany({ where: { entityType: "task", entityId: id }, orderBy: { createdAt: "desc" }, take: 50 });
    return {
      ...toTaskListDto(row),
      activity: audit.map((a) => ({ id: a.id, action: a.action, actorName: a.actorName, metadata: a.metadata as Record<string, unknown>, createdAt: a.createdAt.toISOString() })),
    };
  });
}

export async function updateTaskStatus(
  ctx: AuthContext,
  id: string,
  body: z.infer<typeof updateTaskStatusSchema>,
  meta?: RequestMeta
): Promise<TaskListDto> {
  const scope = requirePermission(ctx, "tasks", "update");
  return withTenant(ctx, async (db) => {
    const existing = await db.task.findFirst({ where: { id } });
    if (!existing || !scopeAllows(ctx, scope, { ownerField: "assignedToId" }, existing)) throw notFound("Task not found.");
    const row = await db.task.update({
      where: { id },
      data: { status: body.status.toUpperCase() as never, completedAt: body.status === "completed" ? new Date() : null },
      include: taskRowInclude,
    });
    await recordAudit(db, ctx, {
      action: "task.status_changed",
      entityType: "task",
      entityId: id,
      metadata: { from: existing.status.toLowerCase(), to: body.status },
      ...meta,
    });
    return toTaskListDto(row);
  });
}

export async function deleteTask(ctx: AuthContext, id: string, meta?: RequestMeta): Promise<{ deleted: true }> {
  const scope = requirePermission(ctx, "tasks", "delete");
  return withTenant(ctx, async (db) => {
    const existing = await db.task.findFirst({ where: { id } });
    if (!existing || !scopeAllows(ctx, scope, { ownerField: "assignedToId" }, existing)) throw notFound("Task not found.");
    await db.task.delete({ where: { id } });
    await recordAudit(db, ctx, { action: "task.deleted", entityType: "task", entityId: id, metadata: { title: existing.title }, ...meta });
    return { deleted: true };
  });
}
