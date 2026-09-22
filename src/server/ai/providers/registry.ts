import {
  configuredProviders,
  defaultProviderFromEnv,
  providerConfig,
  providerIds,
  providerLabels,
  type ProviderId,
} from "../config";
import { AnthropicProvider } from "./anthropic";
import { GoogleProvider } from "./google";
import { OpenAiProvider } from "./openai";
import type { AiProvider } from "./types";

/**
 * Turns a provider id into a ready adapter. This is the ONLY place that knows which class serves which
 * provider; adding a fourth provider means one adapter file and one line here.
 */
export function getProvider(id: ProviderId): AiProvider | null {
  const config = providerConfig(id);
  if (!config) return null;
  switch (id) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAiProvider(config);
    case "google":
      return new GoogleProvider(config);
  }
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  configured: boolean;
  /** The model that will be used, when configured. Never a key, URL or credential. */
  model: string | null;
}

export function providerStatuses(): ProviderStatus[] {
  const available = new Set(configuredProviders());
  return providerIds.map((id) => ({
    id,
    name: providerLabels[id],
    configured: available.has(id),
    model: available.has(id) ? (providerConfig(id)?.model ?? null) : null,
  }));
}

export { configuredProviders, defaultProviderFromEnv };
