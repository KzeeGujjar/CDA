import { z } from "zod";
import type { AiConversation, AiMessage } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { AppError, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { providerIds, type ProviderId } from "@/server/ai/config";
import { buildSystemPrompt, MAX_USER_MESSAGE_CHARS, normalizeTurns, titleFrom } from "@/server/ai/prompts";
import { providerStatuses } from "@/server/ai/providers/registry";
import type { AiTurn } from "@/server/ai/providers/types";
import { recordAudit } from "@/server/modules/audit/record";
import { likeSafe } from "@/server/modules/crm-common";
import { loadToolCalls, type ToolCallDto } from "./ai-tool-calls";
import { recordAiActivity } from "./ai-activity.service";
import { runAi } from "./ai-runner";
import { loadRecordContext, type RecordType } from "./record-context";

/**
 * Chat conversations. They are private: only the user who started a conversation can read, continue, rename
 * or delete it (not even the dealership owner), because staff paste customer details into them. Records
 * (vehicle, customer, lead, deal) can be attached; the model then receives only the fields the user may see.
 */

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "is not a valid id");
const contextSchema = z.strictObject({ type: z.enum(["vehicle", "customer", "lead", "deal"]), id: idSchema });

export const createConversationSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  context: contextSchema.optional(),
});
export const updateConversationSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((v) => v.title !== undefined || v.status !== undefined, { message: "Nothing to update." });
export const sendMessageSchema = z.strictObject({
  content: z.string().trim().min(1).max(MAX_USER_MESSAGE_CHARS),
  provider: z.enum(providerIds).optional(),
});
export const listConversationsQuerySchema = z.strictObject({
  status: z.enum(["active", "archived"]).default("active"),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const parse = <T>(schema: z.ZodType<T>, query: URLSearchParams): T => schema.parse(Object.fromEntries(query.entries()));

export interface ConversationDto {
  id: string;
  title: string;
  status: string;
  context: { type: RecordType; id: string } | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}
export interface MessageDto {
  /** Tools the assistant used for this message (agent only). */
  toolCalls?: ToolCallDto[];
  id: string;
  position: number;
  role: string;
  status: string;
  content: string;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
  createdAt: string;
}

const contextOf = (
  c: Pick<AiConversation, "vehicleId" | "customerId" | "leadId" | "dealId">
): { type: RecordType; id: string } | null =>
  c.vehicleId
    ? { type: "vehicle", id: c.vehicleId }
    : c.customerId
      ? { type: "customer", id: c.customerId }
      : c.leadId
        ? { type: "lead", id: c.leadId }
        : c.dealId
          ? { type: "deal", id: c.dealId }
          : null;

const toConversation = (c: AiConversation): ConversationDto => ({
  id: c.id,
  title: c.title,
  status: c.status.toLowerCase(),
  context: contextOf(c),
  messageCount: c.messageCount,
  lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
});
export const toMessage = (m: AiMessage): MessageDto => ({
  id: m.id,
  position: m.position,
  role: m.role.toLowerCase(),
  status: m.status.toLowerCase(),
  content: m.content,
  provider: m.provider?.toLowerCase() ?? null,
  model: m.model,
  inputTokens: m.inputTokens,
  outputTokens: m.outputTokens,
  errorCode: m.errorCode,
  createdAt: m.createdAt.toISOString(),
});

export async function listProviders(ctx: AuthContext) {
  requirePermission(ctx, "ai_agent", "read");
  return { providers: providerStatuses() };
}

export async function createConversation(
  ctx: AuthContext,
  body: z.infer<typeof createConversationSchema>,
  meta?: RequestMeta
): Promise<ConversationDto> {
  requirePermission(ctx, "ai_agent", "create");
  const row = await withTenant(ctx, async (db) => {
    let label: string | null = null;
    if (body.context) label = (await loadRecordContext(ctx, db, body.context.type, body.context.id)).label;
    const created = await db.aiConversation.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        title: body.title ?? label ?? "New conversation",
        ...(body.context?.type === "vehicle" ? { vehicleId: body.context.id } : {}),
        ...(body.context?.type === "customer" ? { customerId: body.context.id } : {}),
        ...(body.context?.type === "lead" ? { leadId: body.context.id } : {}),
        ...(body.context?.type === "deal" ? { dealId: body.context.id } : {}),
      },
    });
    await recordAudit(db, ctx, {
      action: "ai.conversation.created",
      entityType: "ai_conversation",
      entityId: created.id,
      ...meta,
    });
    return created;
  });
  return toConversation(row);
}

export async function listConversations(
  ctx: AuthContext,
  query: URLSearchParams
): Promise<{ items: ConversationDto[]; total: number }> {
  requirePermission(ctx, "ai_agent", "read");
  const q = parse(listConversationsQuerySchema, query);
  const s = q.search ? likeSafe(q.search) : undefined;
  const where = {
    userId: ctx.userId,
    status: q.status.toUpperCase() as "ACTIVE" | "ARCHIVED",
    ...(s ? { title: { contains: s, mode: "insensitive" as const } } : {}),
  };
  return withTenant(ctx, async (db) => {
    const [rows, total] = await Promise.all([
      db.aiConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: q.limit,
        skip: q.offset,
      }),
      db.aiConversation.count({ where }),
    ]);
    return { items: rows.map(toConversation), total };
  });
}

/** Another user's conversation, another organization's, and a missing one are all the same 404. */
async function ownConversation(ctx: AuthContext, db: Parameters<Parameters<typeof withTenant>[1]>[0], id: string) {
  const row = await db.aiConversation.findFirst({ where: { id, userId: ctx.userId } });
  if (!row) throw notFound("Conversation not found.");
  return row;
}

export async function getConversation(
  ctx: AuthContext,
  id: string
): Promise<ConversationDto & { messages: MessageDto[] }> {
  requirePermission(ctx, "ai_agent", "read");
  return withTenant(ctx, async (db) => {
    const conv = await ownConversation(ctx, db, id);
    const messages = await db.aiMessage.findMany({ where: { conversationId: id }, orderBy: { position: "asc" } });
    const calls = await loadToolCalls(db, id);
    return {
      ...toConversation(conv),
      messages: messages.map((m) => ({ ...toMessage(m), ...(calls.has(m.id) ? { toolCalls: calls.get(m.id) } : {}) })),
    };
  });
}

export async function updateConversation(
  ctx: AuthContext,
  id: string,
  body: z.infer<typeof updateConversationSchema>
): Promise<ConversationDto> {
  requirePermission(ctx, "ai_agent", "create");
  return withTenant(ctx, async (db) => {
    await ownConversation(ctx, db, id);
    const row = await db.aiConversation.update({
      where: { id },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.status ? { status: body.status.toUpperCase() as "ACTIVE" | "ARCHIVED" } : {}),
      },
    });
    return toConversation(row);
  });
}

/** Deleting removes the messages (they may contain personal data). The usage ledger keeps only counts and cost. */
export async function deleteConversation(ctx: AuthContext, id: string, meta?: RequestMeta): Promise<{ deleted: true }> {
  requirePermission(ctx, "ai_agent", "create");
  await withTenant(ctx, async (db) => {
    await ownConversation(ctx, db, id);
    await db.aiMessage.deleteMany({ where: { conversationId: id } });
    await db.aiConversation.delete({ where: { id } });
    await recordAudit(db, ctx, {
      action: "ai.conversation.deleted",
      entityType: "ai_conversation",
      entityId: id,
      ...meta,
    });
  });
  return { deleted: true };
}

/**
 * Step 1 of every AI turn (plain chat and the agent): check the conversation is the caller's and active, load the
 * record it is about under the caller's permissions, save the user's message, and gather the history.
 */
export async function prepareTurn(ctx: AuthContext, conversationId: string, content: string) {
  return withTenant(ctx, async (db) => {
    const conv = await ownConversation(ctx, db, conversationId);
    if (conv.status !== "ACTIVE") throw new AppError(409, "conversation_archived", "This conversation is archived.");
    const org = await db.organization.findFirstOrThrow({ select: { name: true, currency: true } });
    const ref = contextOf(conv);
    // Permissions are re-checked every time: losing access to the record also removes it from the AI's view.
    const record = ref ? await loadRecordContext(ctx, db, ref.type, ref.id) : null;
    const past = await db.aiMessage.findMany({ where: { conversationId }, orderBy: { position: "desc" }, take: 60 });
    const nextPosition = (past[0]?.position ?? 0) + 1;
    const userRow = await db.aiMessage
      .create({
        data: {
          organizationId: ctx.organizationId,
          conversationId,
          position: nextPosition,
          role: "USER",
          content: content,
        },
      })
      .catch((error) => {
        // Two sends at the same moment claim the same position; the second is told to retry.
        if ((error as { code?: string }).code === "P2002")
          throw new AppError(409, "conversation_busy", "Another message is being processed. Try again in a moment.");
        throw error;
      });
    await db.aiConversation.update({
      where: { id: conversationId },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
        ...(conv.messageCount === 0 && conv.title === "New conversation" ? { title: titleFrom(content) } : {}),
      },
    });
    const history: AiTurn[] = past
      .reverse()
      .filter((m) => m.status === "COMPLETE" && (m.role === "USER" || m.role === "ASSISTANT"))
      .map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));
    return { conv, org, record, userRow, history, nextPosition };
  });
}

export interface SendMessageResult {
  userMessage: MessageDto;
  assistantMessage: MessageDto;
  usage: { provider: ProviderId; model: string; inputTokens: number; outputTokens: number; latencyMs: number };
}

export async function sendMessage(
  ctx: AuthContext,
  conversationId: string,
  body: z.infer<typeof sendMessageSchema>,
  meta?: RequestMeta
): Promise<SendMessageResult> {
  requirePermission(ctx, "ai_agent", "create");

  // 1. Save the user's message and gather what the model needs (permission-checked, in one transaction).
  const prepared = await prepareTurn(ctx, conversationId, body.content);

  // 2. Ask the provider (no database transaction is held open during the network call).
  const system = buildSystemPrompt({
    dealershipName: prepared.org.name,
    currency: prepared.org.currency,
    recordContext: prepared.record?.text,
  });
  const turns = normalizeTurns([...prepared.history, { role: "user", content: body.content }]);
  const parentIds = {
    vehicleId: prepared.conv.vehicleId ?? undefined,
    customerId: prepared.conv.customerId ?? undefined,
  };
  let result;
  try {
    result = await runAi(ctx, {
      feature: "CHAT_RESPONSE",
      system,
      messages: turns,
      requestedProvider: body.provider,
      conversationId,
      requestId: meta?.requestId,
    });
  } catch (error) {
    // Keep a visible trace in the conversation and the activity feed, then let the error reach the client.
    const code = error instanceof AppError ? error.code : "ai_error";
    await withTenant(ctx, async (db) => {
      await db.aiMessage.create({
        data: {
          organizationId: ctx.organizationId,
          conversationId,
          position: prepared.nextPosition + 1,
          role: "ASSISTANT",
          status: "ERROR",
          content: "",
          errorCode: code,
        },
      });
      await db.aiConversation.update({ where: { id: conversationId }, data: { messageCount: { increment: 1 } } });
      if (
        error instanceof AppError &&
        ["ai_provider_error", "ai_unavailable", "ai_timeout", "ai_content_filtered"].includes(code)
      ) {
        await recordAiActivity(db, ctx, {
          action: "CHAT_RESPONSE",
          status: "FAILED",
          summary: "Chat response failed",
          conversationId,
          ...parentIds,
        });
      }
    }).catch(() => undefined);
    throw error;
  }

  // 3. Save the answer and the activity entry together.
  const assistantRow = await withTenant(ctx, async (db) => {
    const row = await db.aiMessage.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId,
        position: prepared.nextPosition + 1,
        role: "ASSISTANT",
        content: result.text,
        provider: result.provider.toUpperCase() as "ANTHROPIC" | "OPENAI" | "GOOGLE",
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        finishReason: result.finishReason,
      },
    });
    await db.aiConversation.update({
      where: { id: conversationId },
      data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    });
    await recordAiActivity(db, ctx, {
      action: "CHAT_RESPONSE",
      summary: prepared.record ? `Answered a question about ${prepared.record.label}` : "Answered a question in chat",
      conversationId,
      usageId: result.usageId,
      timeSavedSeconds: 60, // a fixed estimate of the time a person would have spent
      ...parentIds,
    });
    return row;
  });

  return {
    userMessage: toMessage(prepared.userRow),
    assistantMessage: toMessage(assistantRow),
    usage: {
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
    },
  };
}
