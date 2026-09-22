import type { AiToolCallStatus, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import { recordAiActivity } from "@/server/modules/ai/ai-activity.service";
import type { AiToolCall } from "../providers/types";
import { ALL_TOOLS, findTool, mayUse } from "./registry";
import type { AgentTool } from "./types";

/**
 * Runs ONE tool call the model asked for. The model is treated as untrusted input: it can ask for anything, and
 * every request goes through the same gates, in order:
 *   1. the tool must exist (there is no "run SQL" tool, so a request for one is just an unknown name);
 *   2. the tool must be one the signed-in user is allowed to use (all its permissions held, checked now);
 *   3. the arguments must be valid JSON and pass the tool's strict schema (unknown keys are refused);
 *   4. a tool that changes something is NOT run: it becomes a proposal a person must approve (see decideAction);
 *   5. a read tool runs inside the caller's tenant transaction, so row-level security applies, and its result
 *      is size-limited before it goes back to the model.
 * Every call, allowed or not, leaves a row in ai_tool_calls.
 */

export const MAX_TOOL_RESULT_CHARS = 8_000;
const MAX_STORED_ARGS_CHARS = 4_000;

export interface ToolRun {
  rowId: string;
  tool: string;
  status: AiToolCallStatus;
  /** What the model is told (JSON text, or "Error: ..."). */
  content: string;
  isError: boolean;
  pending: boolean;
}

function truncated(json: string): string {
  return json.length <= MAX_TOOL_RESULT_CHARS
    ? json
    : `${json.slice(0, MAX_TOOL_RESULT_CHARS)}... [result truncated: narrow the search to see more]`;
}

function storedArgs(args: unknown): Prisma.InputJsonValue {
  const json = JSON.stringify(args ?? {});
  return json.length <= MAX_STORED_ARGS_CHARS ? (JSON.parse(json) as Prisma.InputJsonValue) : { truncated: true };
}

const errorText = (message: string) => `Error: ${message}`;

export async function runToolCall(
  ctx: AuthContext,
  call: AiToolCall,
  offered: ReadonlyMap<string, AgentTool>,
  where: { conversationId: string }
): Promise<ToolRun> {
  const record = async (
    status: AiToolCallStatus,
    summary: string,
    args: unknown,
    extra: { errorCode?: string; durationMs?: number } = {}
  ) =>
    withTenant(ctx, (db) =>
      db.aiToolCall.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          conversationId: where.conversationId,
          toolName: /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(call.name) ? call.name : "invalid_name",
          arguments: storedArgs(args),
          status,
          resultSummary: summary.slice(0, 300),
          ...extra,
        },
      })
    );
  const finish = async (
    status: AiToolCallStatus,
    content: string,
    summary: string,
    args: unknown,
    extra: { errorCode?: string; durationMs?: number } = {}
  ): Promise<ToolRun> => {
    const row = await record(status, summary, args, extra);
    return {
      rowId: row.id,
      tool: row.toolName,
      status,
      content,
      isError: status !== "OK",
      pending: status === "AWAITING_CONFIRMATION",
    };
  };

  const tool = findTool(call.name);
  if (!tool) {
    return finish(
      "DENIED",
      errorText(`there is no tool named "${call.name.slice(0, 60)}". Use only the tools you were given.`),
      "Unknown tool requested",
      call.arguments,
      { errorCode: "unknown_tool" }
    );
  }
  if (!offered.has(tool.name) || !mayUse(ctx, tool)) {
    return finish(
      "DENIED",
      errorText("the signed-in user is not allowed to use this tool. Tell the user they do not have permission."),
      "Not permitted",
      call.arguments,
      { errorCode: "not_permitted" }
    );
  }
  if (call.invalidArguments) {
    return finish(
      "ERROR",
      errorText("the arguments were not valid JSON. Try again with a JSON object."),
      "Invalid arguments",
      {},
      { errorCode: "invalid_arguments" }
    );
  }
  const parsed = tool.schema.safeParse(call.arguments);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`)
      .join("; ");
    return finish(
      "ERROR",
      errorText(`invalid arguments (${issues}). Fix them and try again.`),
      "Invalid arguments",
      call.arguments,
      { errorCode: "invalid_arguments" }
    );
  }
  const args = parsed.data;

  if (tool.confirm) {
    const description = tool.describe?.(args) ?? `Run ${tool.name}`;
    const run = await finish("AWAITING_CONFIRMATION", "", description, args);
    run.content = JSON.stringify({
      status: "awaiting_user_approval",
      actionId: run.rowId,
      message:
        "This action has NOT been done. It is waiting for the user to approve it. Tell the user what you proposed and ask them to approve it.",
    });
    run.isError = false;
    return run;
  }

  const started = Date.now();
  try {
    const result =
      tool.needsDb === false
        ? await tool.execute(ctx, undefined as never, args)
        : await withTenant(ctx, (db) => tool.execute(ctx, db, args));
    const durationMs = Date.now() - started;
    const run = await finish("OK", truncated(JSON.stringify(result)), tool.summarize(result), args, { durationMs });
    if (tool.activity) {
      await withTenant(ctx, (db) =>
        recordAiActivity(db, ctx, {
          action: tool.activity!,
          summary: tool.summarize(result),
          conversationId: where.conversationId,
        })
      ).catch(() => undefined);
    }
    return run;
  } catch (error) {
    const durationMs = Date.now() - started;
    if (error instanceof AppError) {
      // Permission and not-found errors are safe to show the model: they carry no data.
      return finish(
        error.status === 403 ? "DENIED" : "ERROR",
        errorText(error.message),
        error.status === 403 ? "Not permitted" : "Tool error",
        args,
        { errorCode: error.code, durationMs }
      );
    }
    if ((error as { name?: string }).name === "ZodError") {
      return finish(
        "ERROR",
        errorText("invalid arguments. Check the values and try again."),
        "Invalid arguments",
        args,
        { errorCode: "invalid_arguments", durationMs }
      );
    }
    console.error(`[agent] tool ${tool.name} failed:`, (error as Error).message);
    return finish("ERROR", errorText("the tool failed. Tell the user something went wrong."), "Tool failed", args, {
      errorCode: "tool_failed",
      durationMs,
    });
  }
}

/** The names of tools that exist (for the "unknown tool" hint and tests). */
export const toolNames = () => ALL_TOOLS.map((t) => t.name);
