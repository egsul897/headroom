/**
 * §1/§10 — the premium-model spend lock.
 *
 * The previous pilot burned gateway credit because execution failures escalated
 * automatically to Sonnet 5 before the underlying harness/provider problem had been
 * isolated. The failures turned out to be HTTP 402 refusals, so the escalation spent real
 * money re-asking a premium model questions the cheap model had never actually been asked.
 *
 * This module makes that structurally impossible rather than a matter of discipline. Every
 * paid call in this mission goes through `assertNotPremium`, which throws BEFORE dispatch.
 * PREMIUM_MODEL_BUDGET is zero and there is no code path that raises it.
 */

export const PREMIUM_MODEL_BUDGET_USD = 0;

/**
 * Premium families, matched on the model id the gateway itself uses. Deliberately broad:
 * a new premium id appearing in the catalogue should be caught by family, not require this
 * list to be updated first. The cost ceiling in `isPremiumByPrice` is the backstop for
 * anything these patterns miss.
 */
export const PREMIUM_ID_PATTERNS: RegExp[] = [
  /^anthropic\/claude-sonnet/i,
  /^anthropic\/claude-opus/i,
  /^anthropic\/claude-fable/i,
  /^openai\/gpt-5(?!.*(?:nano|mini))/i,
  /^openai\/gpt-6/i,
  /\bpro\b/i,
  /^google\/gemini-[0-9.]+-pro/i,
  /^spacexai\/grok-(?:4\.[2-9]|4\.1[0-9]|[5-9])/i,
  /^moonshotai\/kimi-k3/i,
  /^sakana\/fugu-(?:max|ultra)/i,
  /^quiverai\/arrow/i,
];

/** §4 — the viability ceiling, in blended $/Mtok terms at the observed input/output mix. */
export const VIABILITY_CEILING_USD_PER_CANDIDATE = 0.02;
export const PREFERRED_CEILING_USD_PER_CANDIDATE = 0.01;

/**
 * Observed token shape of one CONMED compilation, measured from the pilot's own completed
 * candidates rather than assumed: the system prompt, few-shots and retrieved context
 * dominate, so this is near-constant per candidate regardless of provision length.
 */
export const OBSERVED_INPUT_TOKENS_PER_CANDIDATE = 29408;
export const OBSERVED_OUTPUT_TOKENS_PER_CANDIDATE = 2296;

export function estimatedCostPerCandidate(inputPerToken: number, outputPerToken: number): number {
  return OBSERVED_INPUT_TOKENS_PER_CANDIDATE * inputPerToken + OBSERVED_OUTPUT_TOKENS_PER_CANDIDATE * outputPerToken;
}

export function isPremiumById(modelId: string): boolean {
  return PREMIUM_ID_PATTERNS.some((p) => p.test(modelId));
}

/** Price-based backstop: anything at or above the viability ceiling is treated as premium. */
export function isPremiumByPrice(inputPerToken: number, outputPerToken: number): boolean {
  return estimatedCostPerCandidate(inputPerToken, outputPerToken) >= VIABILITY_CEILING_USD_PER_CANDIDATE;
}

export class PremiumModelBlockedError extends Error {
  constructor(
    readonly modelId: string,
    readonly reason: string,
  ) {
    super(`PREMIUM_MODEL_BLOCKED: refusing to dispatch to ${modelId} — ${reason}. PREMIUM_MODEL_BUDGET is $${PREMIUM_MODEL_BUDGET_USD}; premium escalation is disabled for this mission.`);
    this.name = "PremiumModelBlockedError";
  }
}

/**
 * Throws before dispatch. Called by every paid path in this mission.
 * Pricing is optional so an id-only check still works where the catalogue is unavailable.
 */
export function assertNotPremium(modelId: string, pricing?: { input: string | number; output: string | number }): void {
  if (isPremiumById(modelId)) throw new PremiumModelBlockedError(modelId, "model id matches a premium family");
  if (pricing) {
    const inP = Number(pricing.input);
    const outP = Number(pricing.output);
    if (isPremiumByPrice(inP, outP)) {
      throw new PremiumModelBlockedError(modelId, `estimated $${estimatedCostPerCandidate(inP, outP).toFixed(4)}/candidate is at or above the $${VIABILITY_CEILING_USD_PER_CANDIDATE} viability ceiling`);
    }
  }
}

/**
 * §2 — failure classification. The previous pilot's central error was treating a provider
 * refusal as a model-quality result, so the three categories are kept strictly apart and
 * only one of them can ever justify trying a different model.
 */
export type FailureCategory = "PROVIDER_OR_HARNESS" | "MODEL_EXECUTION" | "SEMANTIC_OUTCOME";

export const PROVIDER_OR_HARNESS_SIGNALS = [
  "PROVIDER_FAILURE",
  "HTTP_402",
  "HTTP_429",
  "INSUFFICIENT_FUNDS",
  "ZERO_TOKEN_STALL",
  "QUEUE_STALL",
  "CONNECTION_RESET",
  "CONCURRENCY_SATURATION",
  "GATEWAY_TIMEOUT",
  "WALL_CLOCK_TIMEOUT",
] as const;

export const MODEL_EXECUTION_SIGNALS = ["MODEL_SCHEMA_FAILURE", "MALFORMED_TOOL_CALL", "CONTEXT_WINDOW_EXCEEDED", "REPEATED_INVALID_STRUCTURED_OUTPUT", "MODEL_CANNOT_PERFORM_ACTION"] as const;

export const SEMANTIC_OUTCOME_SIGNALS = ["REVIEW_REQUIRED", "HONEST_UNRESOLVED", "NO_CREDIT", "PARTIAL", "UNSUPPORTED_BY_SOURCE", "LOW_CONFIDENCE", "SEMANTIC_INVENTORY_COVERAGE_GAP", "INVENTORY_ITEM_MISSING_FROM_COMPOSITION", "OPERATIVE_STATE_UNRESOLVED"] as const;

export function classifyFailureCategory(status: string, failureReasons: string[], billedTokens: number): FailureCategory {
  // A provider signal wins over everything it is bundled with. The 402 envelopes carried a
  // tail of downstream accountability symptoms; filing the refusal under one of those is
  // exactly how a billing fault gets mistaken for a model fault.
  if (failureReasons.some((r) => (PROVIDER_OR_HARNESS_SIGNALS as readonly string[]).includes(r))) return "PROVIDER_OR_HARNESS";
  // Accepted but never served: no tokens billed and no output. Not a model outcome.
  if (status === "FAILED" && billedTokens === 0) return "PROVIDER_OR_HARNESS";
  if (failureReasons.some((r) => (MODEL_EXECUTION_SIGNALS as readonly string[]).includes(r))) return "MODEL_EXECUTION";
  return "SEMANTIC_OUTCOME";
}

/** Only a genuine model-execution failure may justify trying a different cheap model. */
export function mayTryAnotherModel(category: FailureCategory): boolean {
  return category === "MODEL_EXECUTION";
}
