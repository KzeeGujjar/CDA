import type { AIProvider, AIRequest, AIResponse, AIService } from "@/types/ai";
import { getCannedResponse } from "@/mock/ai-conversations";

let activeProvider: AIProvider = "openai";

const providerModel: Record<AIProvider, string> = {
  openai: "gpt-4o-mini (placeholder)",
  anthropic: "claude-sonnet (placeholder)",
  google: "gemini-1.5 (placeholder)",
  other: "custom-model (placeholder)",
};

export function getActiveAIProvider(): AIProvider {
  return activeProvider;
}

export function setActiveAIProvider(provider: AIProvider): void {
  activeProvider = provider;
}

const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mock implementation of AIService. Swapping in a real provider means
 * replacing this class's `complete()` body with an actual API call — every
 * caller (chat, marketing copy, document assistant) already depends only on
 * the AIService interface, not on this implementation.
 */
class MockAIService implements AIService {
  async complete(request: AIRequest): Promise<AIResponse> {
    await wait();
    const content = getCannedResponse(request.prompt);
    return {
      content,
      provider: activeProvider,
      model: providerModel[activeProvider],
    };
  }
}

export const mockAIService: AIService = new MockAIService();

export const aiService: AIService = mockAIService;
