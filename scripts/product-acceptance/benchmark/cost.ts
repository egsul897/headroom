/**
 * Cost model — DETERMINISTIC ESTIMATES, never measured spend.
 *
 * Model-call structure per compiled unit mirrors the certified pipeline as observed in the acceptance runs: 2 Pass A
 * inventory calls (dual-pass ensemble), 1 Pass B composition call, 1 Layer-2 review call, plus 1 condition-suspicion
 * classification per unit. Input tokens are estimated at chars/4 over the unit text plus the context the pipeline
 * attaches (definitions, prompt overhead); output tokens are a fixed allowance per call. Prices come from the
 * production rate card for the locked model. Latency is a HYPOTHETICAL PROJECTION (no run was timed with a model).
 */
import { rateCardFor } from "../../../lib/contract-model/analyzer/pricing";
import type { Scope } from "./strategies";

export const COST_MODEL = "deepseek/deepseek-v4-flash";
export const PROMPT_OVERHEAD_TOKENS = 1800; // system prompt + tool schema + accountability block, observed order of magnitude in live runs (not re-measured here)
export const OUTPUT_ALLOWANCE = { passA: 600, passB: 1200, review: 400, classifier: 80 };
export const LATENCY_PROJECTION_S_PER_CALL = 12; // hypothetical; the live §7.5(j) run averaged tens of seconds per call

export interface CostEstimate {
  label: "DETERMINISTIC_ESTIMATE";
  units: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  projectedLatencyS: { label: "HYPOTHETICAL_PROJECTION"; serial: number; parallel8: number };
}

export function estimateCost(scope: Scope): CostEstimate {
  const card = rateCardFor(COST_MODEL);
  if (!card) throw new Error(`no rate card for ${COST_MODEL}`);
  const defChars = scope.definitions.reduce((n, d) => n + d.chars, 0);
  let inputTokens = 0, outputTokens = 0, calls = 0;
  for (const u of scope.units) {
    const unitTokens = Math.ceil(u.chars / 4) + Math.ceil(defChars / 4) + PROMPT_OVERHEAD_TOKENS;
    // Pass A ×2 (unit text only), Pass B (unit + definitions + inventory), classifier, review (unit + IR projection)
    inputTokens += 2 * (Math.ceil(u.chars / 4) + PROMPT_OVERHEAD_TOKENS) + unitTokens + 2 * (Math.ceil(u.chars / 4) + 600);
    outputTokens += 2 * OUTPUT_ALLOWANCE.passA + OUTPUT_ALLOWANCE.passB + OUTPUT_ALLOWANCE.review + OUTPUT_ALLOWANCE.classifier;
    calls += 5;
  }
  const estimatedUsd = inputTokens * card.inputPerToken + outputTokens * card.outputPerToken;
  return { label: "DETERMINISTIC_ESTIMATE", units: scope.units.length, modelCalls: calls, inputTokens, outputTokens, estimatedUsd, projectedLatencyS: { label: "HYPOTHETICAL_PROJECTION", serial: calls * LATENCY_PROJECTION_S_PER_CALL, parallel8: Math.ceil(calls / 8) * LATENCY_PROJECTION_S_PER_CALL } };
}

/** Units whose content-addressed identity changes when one node's text changes: the node itself plus every scoped unit that references it or shares a definition with it. */
export function incrementalRecompileUnits(scope: Scope, changedSectionRef: string, dependents: Set<string>): { withContentAddressing: number; withoutContentAddressing: number } {
  const affected = scope.units.filter((u) => u.sectionRef === changedSectionRef || u.sectionRef.startsWith(changedSectionRef + "(") || dependents.has(u.sectionRef)).length;
  return { withContentAddressing: Math.max(1, affected), withoutContentAddressing: scope.units.length };
}
