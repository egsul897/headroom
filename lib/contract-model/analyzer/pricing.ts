/**
 * Provider/model pricing adapter. Usage telemetry (tokens, calls, latency) is one thing; cost is a
 * separate calculation that depends on WHICH model answered. The legacy rate card priced every
 * non-Opus model as Sonnet, so a DeepSeek call was recorded at ~17x its real cost. A model this
 * table does not know is priced UNKNOWN (null), never guessed; cached-token pricing is likewise
 * UNKNOWN when the table has no cached rate for the model.
 */
export const PRICING_TABLE_VERSION = "headroom-pricing.v1 (2026-09)";

export interface RateCard { inputPerToken: number; outputPerToken: number; cachedInputPerToken: number | null }

/** USD per token. Keys are exact model ids as the provider reports them (gateway "vendor/model" or direct). */
export const RATE_CARDS: Readonly<Record<string, RateCard>> = {
  "claude-sonnet-5": { inputPerToken: 2 / 1e6, outputPerToken: 10 / 1e6, cachedInputPerToken: 0.2 / 1e6 },
  "anthropic/claude-sonnet-5": { inputPerToken: 2 / 1e6, outputPerToken: 10 / 1e6, cachedInputPerToken: 0.2 / 1e6 },
  "claude-opus-5": { inputPerToken: 5 / 1e6, outputPerToken: 25 / 1e6, cachedInputPerToken: 0.5 / 1e6 },
  "anthropic/claude-opus-5": { inputPerToken: 5 / 1e6, outputPerToken: 25 / 1e6, cachedInputPerToken: 0.5 / 1e6 },
  "deepseek/deepseek-v4-flash": { inputPerToken: 0.13 / 1e6, outputPerToken: 0.26 / 1e6, cachedInputPerToken: 0.028 / 1e6 },
};

export interface PriceableUsage { inputTokens: number | null; outputTokens: number | null; cachedInputTokens?: number | null; cacheCreationInputTokens?: number | null }

export interface PricedUsage {
  costUsd: number | null;
  pricingVersion: string;
  /** PRICED: every token class billed at a known rate. UNKNOWN_MODEL: no rate card. CACHED_UNKNOWN: cached tokens present but no cached rate (they are NOT folded into ordinary input). */
  pricingStatus: "PRICED" | "UNKNOWN_MODEL" | "CACHED_UNKNOWN" | "NO_USAGE";
  rateCard: RateCard | null;
}

export function rateCardFor(model: string): RateCard | null { return RATE_CARDS[model] ?? null; }

export function priceUsage(usage: PriceableUsage, model: string): PricedUsage {
  const card = rateCardFor(model);
  if (usage.inputTokens === null || usage.outputTokens === null) return { costUsd: null, pricingVersion: PRICING_TABLE_VERSION, pricingStatus: "NO_USAGE", rateCard: card };
  if (!card) return { costUsd: null, pricingVersion: PRICING_TABLE_VERSION, pricingStatus: "UNKNOWN_MODEL", rateCard: null };
  const cached = usage.cachedInputTokens ?? 0;
  if (cached > 0 && card.cachedInputPerToken === null) return { costUsd: null, pricingVersion: PRICING_TABLE_VERSION, pricingStatus: "CACHED_UNKNOWN", rateCard: card };
  // Anthropic reports input_tokens EXCLUDING cache reads; a cached read is billed at the cached rate.
  const cost = usage.inputTokens * card.inputPerToken + usage.outputTokens * card.outputPerToken + cached * (card.cachedInputPerToken ?? 0);
  return { costUsd: Number(cost.toFixed(10)), pricingVersion: PRICING_TABLE_VERSION, pricingStatus: "PRICED", rateCard: card };
}

/** Upper bound for a request BEFORE it is sent: every planned input token at the input rate, every allowed output token at the output rate. */
export function maxCostOfRequestUsd(estimate: { maxInputTokens: number; maxOutputTokens: number }, model: string): number | null {
  const card = rateCardFor(model);
  if (!card) return null;
  return Number((estimate.maxInputTokens * card.inputPerToken + estimate.maxOutputTokens * card.outputPerToken).toFixed(10));
}
