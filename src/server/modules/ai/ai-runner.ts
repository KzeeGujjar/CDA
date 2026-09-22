import type { AiActionType } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth/context";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import {
  configuredProviders,
  defaultProviderFromEnv,
  requestTimeoutMs,
  type ProviderId,
  providerIds,
} from "@/server/ai/config";
import { estimateCostMicros } from "@/server/ai/pricing";
import { getProvider } from "@/server/ai/providers/registry";
import {
  AiProviderError,
  type AiCompletionResult,
  type AiConversationTurn,
  type AiToolDefinition,
} from "@/server/ai/providers/types";

/**
 * The single door to every AI provider. A feature (chat, valuation, lead scoring, marketing copy...) calls
 * runAi() and gets text back; this function is where the rules are applied, in one place:
 *
 *   organization switch -> provider choice (org allow-list, configured only) -> per-user rate limit ->
 *   monthly token / cost budget -> the provider call (timeout, one retry) -> usage ledger row (always).
 *
 * The caller never sees a provider SDK, URL or key. Provider errors are translated into a small set of
 * client-safe errors; the provider's own message stays in the server log.
 */

export interface RunAiInput {
  feature: AiActionType;
  system?: string;
  /** Alternating user/assistant turns starting with a user turn (see normalizeTurns). */
  messages: AiConversationTurn[];
  /** Tools the model may call (the agent). The caller decides what to do with the calls; runAi never runs them. */
  tools?: AiToolDefinition[];
  /** A provider the caller asks for; must be allowed by the organization and configured on the server. */
  requestedProvider?: ProviderId;
  conversationId?: string;
  temperature?: number;
  requestId?: string;
}

export interface RunAiResult extends AiCompletionResult {
  provider: ProviderId;
  costMicros: bigint | null;
  latencyMs: number;
  usageId: string;
}

export interface AiSettingsRow {
  enabled: boolean;
  defaultProvider: ProviderId | null;
  allowedProviders: ProviderId[];
  monthlyTokenLimit: bigint | null;
  monthlyCostLimitMicros: bigint | null;
  requestsPerUserPerMinute: number;
  maxOutputTokens: number;
}

export const DEFAULT_AI_SETTINGS: AiSettingsRow = {
  enabled: true,
  defaultProvider: null,
  allowedProviders: [],
  monthlyTokenLimit: null,
  monthlyCostLimitMicros: null,
  requestsPerUserPerMinute: 20,
  maxOutputTokens: 1024,
};

const toId = (p: string) => p.toLowerCase() as ProviderId;
const toEnum = (p: ProviderId) => p.toUpperCase() as "ANTHROPIC" | "OPENAI" | "GOOGLE";

/** Start of the current calendar month (UTC): the window budgets are counted in. */
export function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const clientError = (error: AiProviderError): AppError => {
  switch (error.kind) {
    case "rate_limit":
    case "overloaded":
    case "unavailable":
      return new AppError(503, "ai_unavailable", "The AI service is busy. Please try again shortly.");
    case "timeout":
      return new AppError(504, "ai_timeout", "The AI service took too long to answer. Please try again.");
    case "content_filtered":
      return new AppError(422, "ai_content_filtered", "The AI declined to answer this request.");
    default:
      // auth, invalid_request, bad_response: our configuration or the provider, never something the user can fix.
      return new AppError(502, "ai_provider_error", "The AI service could not complete this request.");
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runAi(ctx: AuthContext, input: RunAiInput): Promise<RunAiResult> {
  const settingsRow = await withTenant(ctx, (db) => db.aiSettings.findFirst());
  const settings: AiSettingsRow = settingsRow
    ? {
        enabled: settingsRow.enabled,
        defaultProvider: settingsRow.defaultProvider ? toId(settingsRow.defaultProvider) : null,
        allowedProviders: settingsRow.allowedProviders.map(toId),
        monthlyTokenLimit: settingsRow.monthlyTokenLimit,
        monthlyCostLimitMicros: settingsRow.monthlyCostLimitMicros,
        requestsPerUserPerMinute: settingsRow.requestsPerUserPerMinute,
        maxOutputTokens: settingsRow.maxOutputTokens,
      }
    : DEFAULT_AI_SETTINGS;

  // Which provider can serve this? (configured on the server AND allowed by the organization)
  const usable = configuredProviders().filter(
    (id) => settings.allowedProviders.length === 0 || settings.allowedProviders.includes(id)
  );
  const fallback = defaultProviderFromEnv() ?? providerIds[0];
  const blocked = async (provider: ProviderId, code: string, error: AppError): Promise<never> => {
    await withTenant(ctx, (db) =>
      db.aiUsage.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          conversationId: input.conversationId,
          feature: input.feature,
          provider: toEnum(provider),
          model: "-",
          status: "BLOCKED",
          errorCode: code,
          requestId: input.requestId,
        },
      })
    );
    throw error;
  };

  if (!settings.enabled) {
    return blocked(
      fallback,
      "ai_disabled",
      new AppError(403, "ai_disabled", "AI is turned off for this organization.")
    );
  }
  let providerId: ProviderId | undefined;
  if (input.requestedProvider) {
    if (!usable.includes(input.requestedProvider)) {
      throw new AppError(400, "provider_not_available", "That AI provider is not available for this organization.");
    }
    providerId = input.requestedProvider;
  } else if (settings.defaultProvider && usable.includes(settings.defaultProvider)) {
    providerId = settings.defaultProvider;
  } else {
    const envDefault = defaultProviderFromEnv();
    providerId = envDefault && usable.includes(envDefault) ? envDefault : usable[0];
  }
  if (!providerId) throw new AppError(503, "ai_not_configured", "No AI provider is configured.");
  const provider = getProvider(providerId);
  if (!provider) throw new AppError(503, "ai_not_configured", "No AI provider is configured.");

  // Per-user rate limit (calls that reached a provider in the last minute).
  const recent = await withTenant(ctx, (db) =>
    db.aiUsage.count({
      where: { userId: ctx.userId, status: { not: "BLOCKED" }, createdAt: { gt: new Date(Date.now() - 60_000) } },
    })
  );
  if (recent >= settings.requestsPerUserPerMinute) {
    throw new AppError(429, "ai_rate_limited", "You are sending AI requests too quickly. Please wait a moment.", {
      "retry-after": "30",
    });
  }

  // Monthly budget (tokens and cost) for the whole organization.
  if (settings.monthlyTokenLimit !== null || settings.monthlyCostLimitMicros !== null) {
    const used = await withTenant(ctx, (db) =>
      db.aiUsage.aggregate({
        where: { status: { not: "BLOCKED" }, createdAt: { gte: monthStartUtc() } },
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      })
    );
    const tokens = BigInt((used._sum.inputTokens ?? 0) + (used._sum.outputTokens ?? 0));
    const cost = used._sum.costMicros ?? 0n;
    if (
      (settings.monthlyTokenLimit !== null && tokens >= settings.monthlyTokenLimit) ||
      (settings.monthlyCostLimitMicros !== null && cost >= settings.monthlyCostLimitMicros)
    ) {
      return blocked(
        providerId,
        "budget_exceeded",
        new AppError(429, "ai_budget_exceeded", "This organization has used its AI allowance for the month.")
      );
    }
  }

  // The provider call: one retry for transient failures.
  const started = Date.now();
  const request = {
    model: provider.model,
    system: input.system,
    messages: input.messages,
    tools: input.tools,
    maxOutputTokens: settings.maxOutputTokens,
    temperature: input.temperature,
    timeoutMs: requestTimeoutMs(),
  };
  let completion: AiCompletionResult | null = null;
  let failure: AiProviderError | null = null;
  for (let attempt = 0; attempt < 2 && !completion; attempt++) {
    try {
      completion = await provider.complete(request);
      failure = null;
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      failure = error;
      if (!error.retryable || attempt === 1) break;
      await sleep(Number(process.env.AI_RETRY_DELAY_MS ?? 500));
    }
  }
  const latencyMs = Date.now() - started;

  const inputTokens = completion?.inputTokens ?? 0;
  const outputTokens = completion?.outputTokens ?? 0;
  const usage = await withTenant(ctx, (db) =>
    db.aiUsage.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        conversationId: input.conversationId,
        feature: input.feature,
        provider: toEnum(providerId),
        model: completion?.model ?? provider.model,
        status: completion ? "SUCCESS" : "ERROR",
        errorCode: failure?.kind,
        inputTokens,
        outputTokens,
        costMicros: completion ? estimateCostMicros(completion.model, inputTokens, outputTokens) : null,
        latencyMs,
        requestId: input.requestId,
      },
    })
  );

  if (!completion) {
    // Our log gets the scrubbed detail; the client gets a generic message.
    console.error(`[ai] ${failure!.message}${failure!.detail ? ` :: ${failure!.detail}` : ""}`);
    throw clientError(failure!);
  }
  return { ...completion, provider: providerId, costMicros: usage.costMicros, latencyMs, usageId: usage.id };
}
