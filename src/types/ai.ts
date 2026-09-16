export const aiProviders = ["openai", "anthropic", "google", "other"] as const;

export type AIProvider = (typeof aiProviders)[number];

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  temperature?: number;
}

export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  context?: Record<string, unknown>;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
}

/**
 * The seam every AI-touched feature in this app talks to. Nothing in the
 * frontend imports an OpenAI/Anthropic/Gemini SDK directly — a real backend
 * later decides which provider and model actually serve a given request;
 * this interface is what it plugs into.
 */
export interface AIService {
  complete(request: AIRequest): Promise<AIResponse>;
}
