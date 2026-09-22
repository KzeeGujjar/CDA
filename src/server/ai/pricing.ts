/**
 * What a call cost, in USD micro-dollars (1,000,000 = US$1). Prices change and differ per model, so they are
 * NOT hard-coded: set AI_PRICING_JSON to {"<model>": {"inputPerMTok": 3, "outputPerMTok": 15}} (USD per million
 * tokens). A model with no price gets cost = null (tokens are always recorded), never a guess.
 *
 * tokens x (USD per million tokens) = micro-dollars, exactly, so no division is needed.
 */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

export function priceTable(env: NodeJS.ProcessEnv = process.env): Record<string, ModelPrice> {
  const raw = env.AI_PRICING_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ModelPrice>>;
    const table: Record<string, ModelPrice> = {};
    for (const [model, p] of Object.entries(parsed)) {
      if (
        typeof p?.inputPerMTok === "number" &&
        typeof p?.outputPerMTok === "number" &&
        p.inputPerMTok >= 0 &&
        p.outputPerMTok >= 0
      ) {
        table[model] = { inputPerMTok: p.inputPerMTok, outputPerMTok: p.outputPerMTok };
      }
    }
    return table;
  } catch {
    return {};
  }
}

export function estimateCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
  table = priceTable()
): bigint | null {
  const price = table[model];
  if (!price) return null;
  return BigInt(Math.round(inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok));
}
