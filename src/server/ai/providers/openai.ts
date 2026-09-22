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

/** OpenAI, through Chat Completions (https://api.openai.com/v1/chat/completions), including function calling. */
export class OpenAiProvider implements AiProvider {
  readonly id = "openai" as const;
  readonly model: string;
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
      `${this.#baseUrl}/v1/chat/completions`,
      { authorization: `Bearer ${this.#apiKey}` },
      {
        model: request.model,
        messages: [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          ...request.messages.flatMap(toOpenAiMessages),
        ],
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                type: "function",
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
            }
          : {}),
        max_completion_tokens: request.maxOutputTokens,
        // Some models accept only their default temperature, so it is sent only when explicitly requested.
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
      request.timeoutMs
    );
    const body = asRecord(json);
    const choice = asRecord(Array.isArray(body.choices) ? body.choices[0] : undefined);
    const message = asRecord(choice.message);
    const text = typeof message.content === "string" ? message.content : "";
    const toolCalls: AiToolCall[] = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
      .map(asRecord)
      .filter((c) => typeof c.id === "string" && typeof asRecord(c.function).name === "string")
      .map((c) => {
        const fn = asRecord(c.function);
        let args: Record<string, unknown> = {};
        let invalid = false;
        try {
          const parsed = JSON.parse(typeof fn.arguments === "string" && fn.arguments ? fn.arguments : "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
          else invalid = true;
        } catch {
          invalid = true;
        }
        return {
          id: c.id as string,
          name: fn.name as string,
          arguments: args,
          ...(invalid ? { invalidArguments: true } : {}),
        };
      });
    const stop = String(choice.finish_reason ?? "");
    const finishReason = toolCalls.length
      ? "tool_calls"
      : stop === "stop"
        ? "stop"
        : stop === "length"
          ? "length"
          : stop === "content_filter"
            ? "filtered"
            : "other";
    if (!text && !toolCalls.length) {
      if (finishReason === "filtered" || typeof message.refusal === "string") {
        throw new AiProviderError(this.id, "content_filtered", false);
      }
      throw new AiProviderError(this.id, "bad_response", false, undefined, "no text in the response");
    }
    const usage = asRecord(body.usage);
    return {
      text,
      ...(toolCalls.length ? { toolCalls } : {}),
      inputTokens: asNumber(usage.prompt_tokens),
      outputTokens: asNumber(usage.completion_tokens),
      finishReason,
      providerRequestId: requestId ?? (typeof body.id === "string" ? body.id : undefined),
      model: typeof body.model === "string" ? body.model : request.model,
    };
  }
}

function toOpenAiMessages(turn: AiConversationTurn): Record<string, unknown>[] {
  if (turn.role === "tool") {
    return turn.results.map((r) => ({ role: "tool", tool_call_id: r.callId, content: r.content }));
  }
  if (turn.role === "assistant" && "toolCalls" in turn) {
    return [
      {
        role: "assistant",
        content: turn.content || null,
        tool_calls: turn.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      },
    ];
  }
  return [{ role: turn.role, content: turn.content }];
}
