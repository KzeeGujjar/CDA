import type { AiToolCall as AiToolCallRow } from "@/generated/prisma/client";
import type { TenantDb } from "@/server/db/tenant";

/** How a tool call is shown to the UI. Arguments are included only for proposals still waiting for a decision. */
export interface ToolCallDto {
  id: string;
  tool: string;
  status: string;
  summary: string | null;
  requiresApproval: boolean;
  arguments?: unknown;
  createdAt: string;
  decidedAt: string | null;
}

export const toToolCallDto = (r: AiToolCallRow): ToolCallDto => {
  const waiting = r.status === "AWAITING_CONFIRMATION";
  return {
    id: r.id,
    tool: r.toolName,
    status: r.status.toLowerCase(),
    summary: r.resultSummary,
    requiresApproval: waiting,
    ...(waiting ? { arguments: r.arguments } : {}),
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  };
};

/** The tool calls of a conversation, grouped by the assistant message they belong to. */
export async function loadToolCalls(db: TenantDb, conversationId: string): Promise<Map<string, ToolCallDto[]>> {
  const rows = await db.aiToolCall.findMany({
    where: { conversationId, messageId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  const byMessage = new Map<string, ToolCallDto[]>();
  for (const r of rows) {
    const list = byMessage.get(r.messageId!) ?? [];
    list.push(toToolCallDto(r));
    byMessage.set(r.messageId!, list);
  }
  return byMessage;
}
