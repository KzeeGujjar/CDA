import { z } from "zod";
import type { AiToolCall as AiToolCallRow } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { AppError, notFound } from "@/server/lib/errors";
import type { RequestMeta } from "@/server/http/api-route";
import { runToolCall, type ToolRun } from "@/server/ai/agent/executor";
import { findTool, mayUse, toolDefinitions, toolsFor } from "@/server/ai/agent/registry";
import { buildAgentSystemPrompt, normalizeTurns } from "@/server/ai/prompts";
import type { AiConversationTurn, AiToolResult } from "@/server/ai/providers/types";
import { recordAudit } from "@/server/modules/audit/record";
import { recordAiActivity } from "./ai-activity.service";
import { prepareTurn, sendMessageSchema, toMessage, type MessageDto } from "./ai-conversations.service";
import { runAi } from "./ai-runner";
import { toToolCallDto, type ToolCallDto } from "./ai-tool-calls";

/**
 * The AI agent: a chat where the model can use a fixed set of tools (search vehicles, get a customer, calculate
 * profit, ...). What keeps it safe:
 *  - it never gets a database handle or SQL: it can only ask for tools by name (see ai/agent/executor.ts);
 *  - it only sees tools the signed-in user's permissions allow, and every call is re-checked when it runs;
 *  - anything that changes data is a PROPOSAL that a person must approve (decideAction), and it then runs with
 *    that person's permissions at that moment;
 *  - a turn is limited in steps, tool calls and result size, and every call is recorded in ai_tool_calls.
 */

export const MAX_AGENT_STEPS = 6;
export const MAX_TOOL_CALLS_PER_TURN = 8;
export const ACTION_TTL_MINUTES = 30;

export const agentMessageSchema = sendMessageSchema;
export const decisionSchema = z.strictObject({ decision: z.enum(["approve", "reject"]) });

export interface AgentToolInfo {
  name: string;
  description: string;
  requiresApproval: boolean;
  /** The permissions that must all be held, e.g. "vehicles:read". */
  requires: string[];
}

export async function listAgentTools(ctx: AuthContext): Promise<{ tools: AgentToolInfo[] }> {
  requirePermission(ctx, "ai_agent", "read");
  return {
    tools: toolsFor(ctx).map((t) => ({
      name: t.name,
      description: t.description,
      requiresApproval: t.confirm,
      requires: t.requires.map(([r, a]) => `${r}:${a}`),
    })),
  };
}

export interface AgentTurnResult {
  userMessage: MessageDto;
  assistantMessage: MessageDto;
  /** Proposed changes waiting for the user's approval (also inside assistantMessage.toolCalls). */
  pendingActions: ToolCallDto[];
  usage: { provider: string; model: string; providerCalls: number; inputTokens: number; outputTokens: number };
}

const FALLBACK_TEXT =
  "I could not finish this request within the allowed number of steps. Please narrow the question or ask it in smaller parts.";

export async function runAgentTurn(
  ctx: AuthContext,
  conversationId: string,
  body: z.infer<typeof agentMessageSchema>,
  meta?: RequestMeta
): Promise<AgentTurnResult> {
  requirePermission(ctx, "ai_agent", "create");
  const prepared = await prepareTurn(ctx, conversationId, body.content);

  const tools = toolsFor(ctx);
  const offered = new Map(tools.map((t) => [t.name, t]));
  const definitions = toolDefinitions(tools);
  const system = buildAgentSystemPrompt({
    dealershipName: prepared.org.name,
    currency: prepared.org.currency,
    recordContext: prepared.record?.text,
    toolNames: tools.map((t) => t.name),
  });
  const messages: AiConversationTurn[] = normalizeTurns([...prepared.history, { role: "user", content: body.content }]);
  const parentIds = {
    vehicleId: prepared.conv.vehicleId ?? undefined,
    customerId: prepared.conv.customerId ?? undefined,
  };

  const runs: ToolRun[] = [];
  let finalText = "";
  let last: Awaited<ReturnType<typeof runAi>> | null = null;
  let providerCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const attach = (messageId: string) =>
    runs.length
      ? withTenant(ctx, (db) =>
          db.aiToolCall.updateMany({
            where: { id: { in: runs.map((r) => r.rowId) }, userId: ctx.userId },
            data: { messageId },
          })
        )
      : Promise.resolve(null);

  try {
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const result = await runAi(ctx, {
        feature: "CHAT_RESPONSE",
        system,
        messages,
        tools: definitions.length ? definitions : undefined,
        requestedProvider: body.provider,
        conversationId,
        requestId: meta?.requestId,
      });
      last = result;
      providerCalls++;
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      if (!result.toolCalls?.length) {
        finalText = result.text;
        break;
      }
      // The model asked for tools. Every call gets an answer (the providers require it), even one we refuse.
      messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
      const results: AiToolResult[] = [];
      for (const call of result.toolCalls) {
        if (runs.length >= MAX_TOOL_CALLS_PER_TURN) {
          results.push({
            callId: call.id,
            name: call.name,
            content: "Error: too many tool calls in one turn.",
            isError: true,
          });
          continue;
        }
        const run = await runToolCall(ctx, call, offered, { conversationId });
        runs.push(run);
        results.push({ callId: call.id, name: call.name, content: run.content, isError: run.isError });
      }
      messages.push({ role: "tool", results });
    }
  } catch (error) {
    // Keep a visible trace: an error entry in the conversation, tool calls attached to it, a failed activity.
    const code = error instanceof AppError ? error.code : "ai_error";
    await withTenant(ctx, async (db) => {
      const row = await db.aiMessage.create({
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
      if (["ai_provider_error", "ai_unavailable", "ai_timeout", "ai_content_filtered"].includes(code)) {
        await recordAiActivity(db, ctx, {
          action: "CHAT_RESPONSE",
          status: "FAILED",
          summary: "Agent response failed",
          conversationId,
          ...parentIds,
        });
      }
      return row;
    })
      .then((row) => attach(row.id))
      .catch(() => undefined);
    throw error;
  }

  const text = finalText || FALLBACK_TEXT;
  const used = [...new Set(runs.filter((r) => r.status === "OK" || r.pending).map((r) => r.tool))];
  const assistantRow = await withTenant(ctx, async (db) => {
    const row = await db.aiMessage.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId,
        position: prepared.nextPosition + 1,
        role: "ASSISTANT",
        content: text,
        provider: last!.provider.toUpperCase() as "ANTHROPIC" | "OPENAI" | "GOOGLE",
        model: last!.model,
        inputTokens,
        outputTokens,
        finishReason: finalText ? last!.finishReason : "steps_exhausted",
      },
    });
    await db.aiConversation.update({
      where: { id: conversationId },
      data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    });
    await recordAiActivity(db, ctx, {
      action: "CHAT_RESPONSE",
      summary: used.length ? `Answered using ${used.join(", ")}` : "Answered a question in chat",
      conversationId,
      usageId: last!.usageId,
      timeSavedSeconds: 60 + 30 * Math.min(used.length, 4),
      ...parentIds,
    });
    return row;
  });
  await attach(assistantRow.id);

  const callRows = runs.length
    ? await withTenant(ctx, (db) =>
        db.aiToolCall.findMany({ where: { id: { in: runs.map((r) => r.rowId) } }, orderBy: { createdAt: "asc" } })
      )
    : [];
  const toolCalls = callRows.map(toToolCallDto);
  return {
    userMessage: toMessage(prepared.userRow),
    assistantMessage: { ...toMessage(assistantRow), toolCalls },
    pendingActions: toolCalls.filter((c) => c.requiresApproval),
    usage: { provider: last!.provider, model: last!.model, providerCalls, inputTokens, outputTokens },
  };
}

// ── approving or rejecting a proposal ────────────────────────────────────────────────────────────

export interface DecisionResult {
  id: string;
  tool: string;
  status: string;
  summary: string | null;
  /** What was created (for example the task), when the action was approved and succeeded. */
  result?: unknown;
}

/**
 * Only the person the agent was working for can decide, and an approved action runs with THEIR permissions as
 * they are now (not as they were when it was proposed): a role change in between can turn an approval into a
 * refusal. Deciding twice, or after the proposal has expired, is refused.
 */
export async function decideAction(
  ctx: AuthContext,
  actionId: string,
  body: z.infer<typeof decisionSchema>,
  meta?: RequestMeta
): Promise<DecisionResult> {
  requirePermission(ctx, "ai_agent", "create");
  const row = await withTenant(ctx, (db) => db.aiToolCall.findFirst({ where: { id: actionId, userId: ctx.userId } }));
  if (!row) throw notFound("Action not found.");
  if (row.status !== "AWAITING_CONFIRMATION")
    throw new AppError(409, "already_decided", "This action has already been decided.");

  const decide = (status: AiToolCallRow["status"], summary: string, errorCode?: string) =>
    withTenant(ctx, async (db) => {
      // Claim the proposal atomically, so two simultaneous approvals cannot both run it.
      const claimed = await db.aiToolCall.updateMany({
        where: { id: actionId, userId: ctx.userId, status: "AWAITING_CONFIRMATION" },
        data: { status, resultSummary: summary.slice(0, 300), errorCode, decidedAt: new Date() },
      });
      return claimed.count === 1;
    });

  if (Date.now() - row.createdAt.getTime() > ACTION_TTL_MINUTES * 60_000) {
    await decide("EXPIRED", "Expired before it was approved", "expired");
    throw new AppError(409, "action_expired", "This proposal expired. Ask the assistant to propose it again.");
  }
  if (body.decision === "reject") {
    if (!(await decide("REJECTED", "Rejected by the user")))
      throw new AppError(409, "already_decided", "This action has already been decided.");
    await withTenant(ctx, (db) =>
      recordAudit(db, ctx, {
        action: "ai.tool.rejected",
        entityType: "ai_tool_call",
        entityId: actionId,
        metadata: { tool: row.toolName },
        ...meta,
      })
    );
    return { id: actionId, tool: row.toolName, status: "rejected", summary: "Rejected by the user" };
  }

  const tool = findTool(row.toolName);
  if (!tool || !tool.confirm) {
    await decide("ERROR", "The tool no longer exists", "unknown_tool");
    throw new AppError(409, "unknown_tool", "This action is no longer available.");
  }
  if (!mayUse(ctx, tool)) {
    await decide("DENIED", "Not permitted at approval time", "not_permitted");
    throw new AppError(403, "forbidden", "You no longer have permission to do this.");
  }
  const parsed = tool.schema.safeParse(row.arguments);
  if (!parsed.success) {
    await decide("ERROR", "The stored arguments are no longer valid", "invalid_arguments");
    throw new AppError(409, "invalid_arguments", "This proposal is no longer valid.");
  }
  if (!(await decide("EXECUTED", "Approved, running", undefined))) {
    throw new AppError(409, "already_decided", "This action has already been decided.");
  }
  try {
    const result = await tool.execute(ctx, undefined as never, parsed.data);
    const summary = tool.summarize(result);
    await withTenant(ctx, async (db) => {
      await db.aiToolCall.update({ where: { id: actionId }, data: { resultSummary: summary } });
      await recordAudit(db, ctx, {
        action: "ai.tool.approved",
        entityType: "ai_tool_call",
        entityId: actionId,
        metadata: { tool: row.toolName },
        ...meta,
      });
    });
    return { id: actionId, tool: row.toolName, status: "executed", summary, result };
  } catch (error) {
    const message = error instanceof AppError ? error.message : "The action failed.";
    if (!(error instanceof AppError))
      console.error(`[agent] approved action ${row.toolName} failed:`, (error as Error).message);
    await withTenant(ctx, (db) =>
      db.aiToolCall.update({
        where: { id: actionId },
        data: {
          status: error instanceof AppError && error.status === 403 ? "DENIED" : "ERROR",
          resultSummary: message.slice(0, 300),
          errorCode: error instanceof AppError ? error.code : "tool_failed",
        },
      })
    ).catch(() => undefined);
    if (error instanceof AppError) throw error;
    throw new AppError(500, "internal_error", "The action could not be completed.");
  }
}
