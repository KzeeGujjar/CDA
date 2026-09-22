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

const SAFE_MODEL = /^[A-Za-z0-9._-]{1,80}$/;

/** Gemini, through generateContent (https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent), including function calling. */
export class GoogleProvider implements AiProvider {
  readonly id = "google" as const;
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
    // The model name goes into the URL path, so it must be a plain identifier.
    if (!SAFE_MODEL.test(request.model)) {
      throw new AiProviderError(this.id, "invalid_request", false, undefined, "unsafe model name");
    }
    const { json, requestId } = await postJson(
      this.id,
      `${this.#baseUrl}/v1beta/models/${request.model}:generateContent`,
      // The key travels in a header, never in the URL (URLs end up in logs).
      { "x-goog-api-key": this.#apiKey },
      {
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        contents: request.messages.map(toGeminiContent),
        ...(request.tools?.length
          ? {
              tools: [
                {
                  functionDeclarations: request.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    // A function without arguments must omit "parameters" (an empty object is rejected).
                    ...(Object.keys((t.parameters.properties as object) ?? {}).length
                      ? { parameters: t.parameters }
                      : {}),
                  })),
                },
              ],
            }
          : {}),
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        },
      },
      request.timeoutMs
    );
    const body = asRecord(json);
    const candidate = asRecord(Array.isArray(body.candidates) ? body.candidates[0] : undefined);
    const rawParts = asRecord(candidate.content).parts;
    const parts = (Array.isArray(rawParts) ? (rawParts as unknown[]) : []).map(asRecord);
    const text = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
    // Gemini does not give function calls an id, so we make one that is unique within the response.
    const toolCalls: AiToolCall[] = parts
      .map((p, i) => ({ call: asRecord(p.functionCall), i }))
      .filter(({ call }) => typeof call.name === "string")
      .map(({ call, i }) => ({
        id: `gemini-${i}-${call.name as string}`,
        name: call.name as string,
        arguments: asRecord(call.args),
      }));
    const stop = String(candidate.finishReason ?? "");
    const finishReason = toolCalls.length
      ? "tool_calls"
      : stop === "STOP"
        ? "stop"
        : stop === "MAX_TOKENS"
          ? "length"
          : ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION"].includes(stop)
            ? "filtered"
            : "other";
    if (!text && !toolCalls.length) {
      if (finishReason === "filtered" || asRecord(body.promptFeedback).blockReason) {
        throw new AiProviderError(this.id, "content_filtered", false);
      }
      throw new AiProviderError(this.id, "bad_response", false, undefined, "no text in the response");
    }
    const usage = asRecord(body.usageMetadata);
    return {
      text,
      ...(toolCalls.length ? { toolCalls } : {}),
      inputTokens: asNumber(usage.promptTokenCount),
      outputTokens: asNumber(usage.candidatesTokenCount),
      finishReason,
      providerRequestId: requestId,
      model: typeof body.modelVersion === "string" ? body.modelVersion : request.model,
    };
  }
}

function toGeminiContent(turn: AiConversationTurn): Record<string, unknown> {
  if (turn.role === "tool") {
    return {
      role: "user",
      parts: turn.results.map((r) => ({
        functionResponse: { name: r.name, response: r.isError ? { error: r.content } : { content: r.content } },
      })),
    };
  }
  if (turn.role === "assistant" && "toolCalls" in turn) {
    return {
      role: "model",
      parts: [
        ...(turn.content ? [{ text: turn.content }] : []),
        ...turn.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.arguments } })),
      ],
    };
  }
  return { role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] };
}
