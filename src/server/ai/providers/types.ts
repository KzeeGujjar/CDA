import type { ProviderId } from "../config";

/**
 * The one shape every AI provider is adapted to. Feature code (chat, valuation, lead scoring, marketing, the
 * agent...) depends on this interface only, so adding a provider or switching one is a change in one file, and
 * a feature never sees a provider SDK, endpoint, header or key.
 */

export interface AiTurn {
  role: "user" | "assistant";
  content: string;
}

/** A tool (function) the model may ask us to run. `parameters` is a plain JSON Schema object. */
export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The model asking for a tool to be run. Nothing runs until our code decides to run it. */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** true when the vendor sent arguments that were not valid JSON (the call must be treated as invalid). */
  invalidArguments?: boolean;
}

export interface AiToolResult {
  callId: string;
  name: string;
  content: string;
  isError?: boolean;
}

/** A turn in an agent conversation: plain text, an assistant turn that asked for tools, or the tools' results. */
export type AiConversationTurn =
  AiTurn | { role: "assistant"; content: string; toolCalls: AiToolCall[] } | { role: "tool"; results: AiToolResult[] };

export interface AiCompletionRequest {
  model: string;
  system?: string;
  /** Alternating turns starting with a user turn (normalised by the caller). */
  messages: AiConversationTurn[];
  /** Tools the model may call. Omit for a plain chat. */
  tools?: AiToolDefinition[];
  maxOutputTokens: number;
  temperature?: number;
  timeoutMs: number;
}

export interface AiCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** end_turn / length / content_filter ... normalised. "tool_calls" means the model wants tools run. */
  finishReason: "stop" | "length" | "filtered" | "tool_calls" | "other";
  toolCalls?: AiToolCall[];
  /** The provider's own request id, for support tickets. Never contains credentials. */
  providerRequestId?: string;
  model: string;
}

export interface AiProvider {
  readonly id: ProviderId;
  readonly model: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

export type AiErrorKind =
  | "auth" // the provider rejected our credentials: an operator problem, never the user's
  | "rate_limit"
  | "overloaded"
  | "unavailable"
  | "timeout"
  | "invalid_request"
  | "bad_response"
  | "content_filtered";

/**
 * A provider failure, already stripped of secrets. `detail` is for OUR logs only (short, scrubbed of API
 * keys); it is never returned to a client.
 */
export class AiProviderError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly kind: AiErrorKind,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly detail?: string
  ) {
    super(`${provider}: ${kind}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "AiProviderError";
  }
}
