import type { ProviderConfig } from "../config";
import { asNumber, asRecord, postJson } from "./http";
import {
  AiProviderError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiConversationTurn,
  type AiProvider,
  type AiToolCall,
} from "./types";

/** Claude, through the Messages API (https://api.anthropic.com/v1/messages), including tool use. */
export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly model: string;
  // ES private fields: the key cannot be serialised, spread, or printed by accident.
  readonly #apiKey: string;
  readonly #baseUrl: string;

  constructor(config: ProviderConfig) {
    this.model = config.model;
    this.#apiKey = config.apiKey;
    this.#baseUrl = config.baseUrl;
  }

  toJSON() {
    return { id: this.id, model: this.model };
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const { json, requestId } = await postJson(
      this.id,
      `${this.#baseUrl}/v1/messages`,
      { "x-api-key": this.#apiKey, "anthropic-version": "2023-06-01" },
      {
        model: request.model,
        max_tokens: request.maxOutputTokens,
        ...(request.system ? { system: request.system } : {}),
        messages: request.messages.map(toAnthropicMessage),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
            }
          : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
      request.timeoutMs
    );
    const body = asRecord(json);
    const blocks = (Array.isArray(body.content) ? body.content : []).map(asRecord);
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    const toolCalls: AiToolCall[] = blocks
      .filter((b) => b.type === "tool_use" && typeof b.name === "string" && typeof b.id === "string")
      .map((b) => ({ id: b.id as string, name: b.name as string, arguments: asRecord(b.input) }));
    const stop = String(body.stop_reason ?? "");
    const finishReason = toolCalls.length
      ? "tool_calls"
      : stop === "end_turn" || stop === "stop_sequence"
        ? "stop"
        : stop === "max_tokens"
          ? "length"
          : stop === "refusal"
            ? "filtered"
            : "other";
    if (!text && !toolCalls.length) {
      if (finishReason === "filtered") throw new AiProviderError(this.id, "content_filtered", false);
      throw new AiProviderError(this.id, "bad_response", false, undefined, "no text in the response");
    }
    const usage = asRecord(body.usage);
    return {
      text,
      ...(toolCalls.length ? { toolCalls } : {}),
      inputTokens: asNumber(usage.input_tokens),
      outputTokens: asNumber(usage.output_tokens),
      finishReason,
      providerRequestId: requestId ?? (typeof body.id === "string" ? body.id : undefined),
      model: typeof body.model === "string" ? body.model : request.model,
    };
  }
}

function toAnthropicMessage(turn: AiConversationTurn): Record<string, unknown> {
  if (turn.role === "tool") {
    return {
      role: "user",
      content: turn.results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.callId,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    };
  }
  if (turn.role === "assistant" && "toolCalls" in turn) {
    return {
      role: "assistant",
      content: [
        ...(turn.content ? [{ type: "text", text: turn.content }] : []),
        ...turn.toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.arguments })),
      ],
    };
  }
  return { role: turn.role, content: turn.content };
}
