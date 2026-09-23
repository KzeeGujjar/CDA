import { z } from "zod";
import type { Conversation, Message } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission, scopeAllows, scopeWhere } from "@/server/auth/authorize";
import { withTenant, type TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { id, likeSafe, page, parseQuery } from "@/server/modules/crm-common";
import { recordAudit } from "@/server/modules/audit/record";
import { getMessageProvider } from "@/server/messaging/registry";

/**
 * The internal conversation/message model behind the unified inbox (whatsapp, email, sms, website_chat,
 * ai_agent). A channel's actual provider (WhatsApp Cloud API, Twilio, Resend...) is an adapter
 * (src/server/messaging/*); this module never imports one directly, only the registry, so the database and
 * this service never know which vendor is behind a channel — see docs/BACKEND_ARCHITECTURE.md §0.20.
 */

const CHANNELS = ["whatsapp", "email", "sms", "website_chat", "ai_agent"] as const;
/** Channels a NEW conversation may be started on from here. website_chat is customer-initiated (no UI to start
 *  one exists yet); ai_agent conversations are created by the AI assistant system (/api/v1/ai/*), not here. */
const SENDABLE_CHANNELS = ["whatsapp", "email", "sms"] as const;

const SCOPE_FIELDS = { ownerField: "assignedToId", branchField: "branchId" } as const;

export const listConversationsQuerySchema = z.strictObject({
  channel: z.enum(CHANNELS).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const createConversationSchema = z
  .strictObject({
    channel: z.enum(SENDABLE_CHANNELS),
    customerId: id.optional(),
    contactName: z.string().trim().min(1).max(200).optional(),
    contactHandle: z.string().trim().min(1).max(320).optional(),
    body: z.string().trim().min(1).max(8000),
  })
  .refine((v) => v.customerId || (v.contactName && v.contactHandle), {
    message: "Give a customerId, or both contactName and contactHandle.",
  });
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.strictObject({ body: z.string().trim().min(1).max(8000) });
export const updateConversationSchema = z.strictObject({ markRead: z.literal(true) });

// ── response shapes ──────────────────────────────────────────────────────────────────────────────

export interface ConversationDto {
  id: string;
  channel: string;
  customerId: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  contactName: string;
  contactHandle: string;
  aiHandling: boolean;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: string;
  status: string;
  body: string;
  sentById: string | null;
  sentByName: string | null;
  errorCode: string | null;
  createdAt: string;
}

type ConversationWithAssignee = Conversation & { assignedTo: { name: string } | null };
const withAssignee = { assignedTo: { select: { name: true } } } as const;

function toConversationDto(c: ConversationWithAssignee): ConversationDto {
  return {
    id: c.id,
    channel: c.channel.toLowerCase(),
    customerId: c.customerId,
    assignedToId: c.assignedToId,
    assignedToName: c.assignedTo?.name ?? null,
    contactName: c.contactName,
    contactHandle: c.contactHandle,
    aiHandling: c.aiHandling,
    unreadCount: c.unreadCount,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

type MessageWithSender = Message & { sentBy: { name: string } | null };
const withSender = { sentBy: { select: { name: true } } } as const;

function toMessageDto(m: MessageWithSender): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction.toLowerCase(),
    status: m.status.toLowerCase(),
    body: m.body,
    sentById: m.sentById,
    sentByName: m.sentBy?.name ?? null,
    errorCode: m.errorCode,
    createdAt: m.createdAt.toISOString(),
  };
}

// ── reading ───────────────────────────────────────────────────────────────────────────────────────

export async function listConversations(ctx: AuthContext, query: URLSearchParams) {
  const scope = requirePermission(ctx, "messages", "read");
  const q = parseQuery(listConversationsQuerySchema, query);
  const s = q.search ? likeSafe(q.search) : undefined;
  return withTenant(ctx, async (db) => {
    const where = {
      AND: [
        scopeWhere(ctx, scope, SCOPE_FIELDS),
        ...(q.channel ? [{ channel: q.channel.toUpperCase() as never }] : []),
        ...(s
          ? [
              {
                OR: [
                  { contactName: { contains: s, mode: "insensitive" as const } },
                  { lastMessagePreview: { contains: s, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const [total, rows] = await Promise.all([
      db.conversation.count({ where }),
      db.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: withAssignee,
      }),
    ]);
    return page(rows.map(toConversationDto), total, q.page, q.pageSize);
  });
}

async function loadConversation(ctx: AuthContext, db: TenantDb, conversationId: string, scope: string) {
  const row = await db.conversation.findFirst({ where: { id: conversationId }, include: withAssignee });
  if (!row || !scopeAllows(ctx, scope as never, SCOPE_FIELDS, row)) throw notFound("Conversation not found.");
  return row;
}

export async function getConversation(ctx: AuthContext, conversationId: string): Promise<ConversationDto> {
  const scope = requirePermission(ctx, "messages", "read");
  const row = await withTenant(ctx, (db) => loadConversation(ctx, db, conversationId, scope));
  return toConversationDto(row);
}

export async function listMessages(ctx: AuthContext, conversationId: string): Promise<MessageDto[]> {
  const scope = requirePermission(ctx, "messages", "read");
  const rows = await withTenant(ctx, async (db) => {
    await loadConversation(ctx, db, conversationId, scope);
    return db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, include: withSender });
  });
  return rows.map(toMessageDto);
}

// ── writing ───────────────────────────────────────────────────────────────────────────────────────

export async function markConversationRead(ctx: AuthContext, conversationId: string, meta?: RequestMeta): Promise<ConversationDto> {
  const scope = requirePermission(ctx, "messages", "update");
  const row = await withTenant(ctx, async (db) => {
    await loadConversation(ctx, db, conversationId, scope);
    const updated = await db.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
      include: withAssignee,
    });
    await recordAudit(db, ctx, { action: "conversation.read", entityType: "conversation", entityId: conversationId, ...meta });
    return updated;
  });
  return toConversationDto(row);
}

/** Sends through the channel's adapter (never inside the DB transaction: it is a real network call), then
 *  records what actually happened — SENT with the provider's id, or FAILED with why. Never a fabricated "sent". */
async function deliver(channel: Conversation["channel"], to: string, body: string) {
  const provider = getMessageProvider(channel);
  if (!provider) return { status: "FAILED" as const, providerMessageId: null, errorCode: "provider_not_configured" };
  try {
    const result = await provider.send({ to, body });
    if (result.status === "sent") return { status: "SENT" as const, providerMessageId: result.providerMessageId ?? null, errorCode: null };
    return { status: "FAILED" as const, providerMessageId: null, errorCode: result.errorCode ?? "send_failed" };
  } catch (error) {
    console.error("[messaging] provider threw:", error instanceof Error ? error.message : error);
    return { status: "FAILED" as const, providerMessageId: null, errorCode: "send_failed" };
  }
}

export async function sendMessage(
  ctx: AuthContext,
  conversationId: string,
  input: z.infer<typeof sendMessageSchema>,
  meta?: RequestMeta
): Promise<MessageDto> {
  const scope = requirePermission(ctx, "messages", "create");
  const convo = await withTenant(ctx, (db) => loadConversation(ctx, db, conversationId, scope));

  const result = await deliver(convo.channel, convo.contactHandle, input.body);

  const row = await withTenant(ctx, async (db) => {
    const message = await db.message.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId,
        direction: "OUTBOUND",
        status: result.status,
        body: input.body,
        sentById: ctx.userId,
        providerMessageId: result.providerMessageId,
        errorCode: result.errorCode,
      },
      include: withSender,
    });
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessagePreview: input.body.slice(0, 300), lastMessageAt: message.createdAt },
    });
    await recordAudit(db, ctx, {
      action: "message.sent",
      entityType: "message",
      entityId: message.id,
      metadata: { channel: convo.channel, status: result.status },
      ...meta,
    });
    return message;
  });
  return toMessageDto(row);
}

/** Starts a new conversation with its first outbound message. Given a customerId, the contact's name/handle
 *  are drawn from the customer record; the channel decides which field (email vs phone) is required. */
export async function createConversation(
  ctx: AuthContext,
  input: CreateConversationInput,
  meta?: RequestMeta
): Promise<ConversationDto> {
  const scope = requirePermission(ctx, "messages", "create");

  const contact = await withTenant(ctx, async (db) => {
    if (!input.customerId) return { name: input.contactName!, handle: input.contactHandle! };
    const customer = await db.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
      select: { name: true, email: true, phone: true },
    });
    if (!customer) throw notFound("Customer not found.");
    const handle = input.channel === "email" ? customer.email : customer.phone;
    if (!handle) throw badRequest(`This customer has no ${input.channel === "email" ? "email address" : "phone number"} on file.`);
    return { name: customer.name, handle };
  });

  const channelEnum = input.channel.toUpperCase() as Conversation["channel"];
  const result = await deliver(channelEnum, contact.handle, input.body);

  const row = await withTenant(ctx, async (db) => {
    const branchId = scope === "organization" ? undefined : ctx.branchIds[0];
    const conversation = await db.conversation.create({
      data: {
        organizationId: ctx.organizationId,
        channel: channelEnum,
        customerId: input.customerId,
        branchId,
        assignedToId: ctx.userId,
        contactName: contact.name,
        contactHandle: contact.handle,
        lastMessagePreview: input.body.slice(0, 300),
        lastMessageAt: new Date(),
      },
      include: withAssignee,
    });
    const message = await db.message.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        status: result.status,
        body: input.body,
        sentById: ctx.userId,
        providerMessageId: result.providerMessageId,
        errorCode: result.errorCode,
      },
    });
    await recordAudit(db, ctx, {
      action: "conversation.created",
      entityType: "conversation",
      entityId: conversation.id,
      metadata: { channel: channelEnum, status: result.status, firstMessageId: message.id },
      ...meta,
    });
    return conversation;
  });
  return toConversationDto(row);
}
