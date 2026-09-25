/**
 * P-7 - a per-call reservation derived mechanically from the execution shape the runner permits.
 *
 * Why the old reservation failed. BudgetLedger.reservationFor priced a TYPICAL candidate: the
 * observed mean input (29,408 tokens) plus the output a model can stream in the wall-clock ceiling
 * (480 s x 125 tok/s = 60,000). Candidate 7.8 billed 1,510,950 input tokens ($0.2094, 10.8x the
 * $0.0194 reservation). Its evidence shows why: five sharded conversations (telemetry.attemptCount
 * 5, retryCount 0), each a tool loop of up to 12 turns in which EVERY turn re-sends the whole
 * conversation (system prompt + few-shot block + context bundle + all prior tool results and
 * assistant turns; cachedInputTokens is null - nothing is credited as cached). ~302k input tokens
 * per conversation = ~25k per turn x 12 turns. The same multiplier drove the two 667k-token
 * MONOLITHIC compiles of the original run (7.5(g), 7.5(h): ~55k x 12 turns from 67 and 208
 * operative characters). Input is multiplied by turns and conversations; wall clock bounds only
 * output. A reservation that ignores the turn multiplier cannot cover the loop.
 *
 * The shape the runner permits, from the limits that actually bound it:
 *   - turns per bounded conversation:   DEFAULT_TOOL_BUDGET.maxToolCalls (8) + MAX_TURN_OVERHEAD (4) = 12
 *     (caller.ts: `const maxTurns = budget.maxToolCalls + MAX_TURN_OVERHEAD`; the overhead constant is
 *     module-private, mirrored here and pinned by test against the source);
 *   - input per turn: the planner's first-turn capacity MAX_FIRST_TURN_INPUT_TOKENS (100,000) plus
 *     everything the loop can add to the context afterwards - retrieved source bounded by
 *     DEFAULT_TOOL_BUDGET.maxAdditionalSourceChars (20,000 chars) and the assistant's own prior turns,
 *     bounded by the candidate's total output (below);
 *   - conversations per compile: the runner has NO cap - the certified planner decides the shard count
 *     from the frozen inventory and a shard may be re-executed once on SHARD_PROVIDER_FAILURE. The
 *     harness therefore DECLARES a cap (MAX_RESERVED_CONVERSATIONS = 5, the population's observed
 *     maximum over 72 billed compiles, retries included) and ENFORCES it: a compile whose telemetry
 *     exceeds the reserved shape stops the run (RESERVATION_SHAPE_EXCEEDED) before another dispatch;
 *   - Pass A inventory calls: 2 x ceil(operativeChars / 6000) (one first-pass batch per 6,000 source
 *     chars, plus at most as many gap-pass batches), each bounded by the same first-turn capacity;
 *   - output per candidate: the wall-clock ceiling x the fastest observed sustained output rate
 *     (480 s x 125 tok/s = 60,000), never more than the requested max_tokens;
 *   - verifier: exactly two calls (adversarial review, condition-suspicion classification), each
 *     bounded by the first-turn capacity, output bounded as above.
 *
 * Everything is priced at the catalogue's real per-token rates for the locked model.
 *
 * Harness only. Nothing in the production pipeline imports it.
 */
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import { MAX_FIRST_TURN_INPUT_TOKENS } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { CALIBRATED_TOKENS_PER_CHAR } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { GatewayModel } from "./probe-models";
import { DEFAULT_CANDIDATE_TIMEOUT_MS, OBSERVED_OUTPUT_TOKENS_PER_SECOND } from "./timeout-policy";

export const MAX_FIRST_TURN_INPUT_TOKENS_REEXPORT = MAX_FIRST_TURN_INPUT_TOKENS;
/** Mirror of caller.ts's module-private MAX_TURN_OVERHEAD; pinned by test against the source text. */
export const MAX_TURN_OVERHEAD_MIRROR = 4;
/** Mirror of inventory.ts's default batchChars; pinned by test against the source text. */
export const PASS_A_BATCH_CHARS_MIRROR = 6000;
/** Harness-declared cap on bounded conversations per compile (shard executions incl. retries). Enforced. */
export const MAX_RESERVED_CONVERSATIONS = 5;
/** Adversarial review + condition-suspicion classification. */
export const VERIFIER_CALLS = 2;

export const TURNS_PER_CONVERSATION = DEFAULT_TOOL_BUDGET.maxToolCalls + MAX_TURN_OVERHEAD_MIRROR;
export const TOOL_SOURCE_TOKENS = Math.ceil(DEFAULT_TOOL_BUDGET.maxAdditionalSourceChars * CALIBRATED_TOKENS_PER_CHAR);

export interface ReservationShape {
  conversations: number;
  turnsPerConversation: number;
  inputTokensPerTurn: number;
  passACalls: number;
  passAInputTokensPerCall: number;
  outputTokens: number;
  /** Totals the reservation prices and the enforcement compares against. */
  inputTokens: number;
  calls: number;
}

/** Output a candidate can be billed for inside the wall-clock ceiling, never above the requested max_tokens. */
export function outputTokensCap(model: GatewayModel, timeoutMs = DEFAULT_CANDIDATE_TIMEOUT_MS): number {
  return Math.min(Math.ceil((timeoutMs / 1000) * OBSERVED_OUTPUT_TOKENS_PER_SECOND), Math.min(model.max_tokens, 128_000));
}

/** `outputTokensOverride` reproduces a reservation taken under an earlier output-rate calibration (resume accounting). */
export function compileShape(model: GatewayModel, operativeChars: number, timeoutMs = DEFAULT_CANDIDATE_TIMEOUT_MS, outputTokensOverride?: number): ReservationShape {
  const outputTokens = outputTokensOverride ?? outputTokensCap(model, timeoutMs);
  const inputTokensPerTurn = MAX_FIRST_TURN_INPUT_TOKENS + TOOL_SOURCE_TOKENS + outputTokens;
  const passACalls = 2 * Math.max(1, Math.ceil(operativeChars / PASS_A_BATCH_CHARS_MIRROR));
  const conversations = MAX_RESERVED_CONVERSATIONS;
  const inputTokens = conversations * TURNS_PER_CONVERSATION * inputTokensPerTurn + passACalls * MAX_FIRST_TURN_INPUT_TOKENS;
  return { conversations, turnsPerConversation: TURNS_PER_CONVERSATION, inputTokensPerTurn, passACalls, passAInputTokensPerCall: MAX_FIRST_TURN_INPUT_TOKENS, outputTokens, inputTokens, calls: conversations * TURNS_PER_CONVERSATION + passACalls };
}

export function verifyShape(model: GatewayModel, timeoutMs = DEFAULT_CANDIDATE_TIMEOUT_MS): ReservationShape {
  const outputTokens = outputTokensCap(model, timeoutMs);
  return { conversations: 0, turnsPerConversation: 0, inputTokensPerTurn: MAX_FIRST_TURN_INPUT_TOKENS, passACalls: 0, passAInputTokensPerCall: 0, outputTokens, inputTokens: VERIFIER_CALLS * MAX_FIRST_TURN_INPUT_TOKENS, calls: VERIFIER_CALLS };
}

export function priceShape(model: GatewayModel, shape: ReservationShape): number {
  return Number((shape.inputTokens * Number(model.pricing.input) + shape.outputTokens * Number(model.pricing.output)).toFixed(8));
}

export function compileReservationUsd(model: GatewayModel, operativeChars: number, timeoutMs = DEFAULT_CANDIDATE_TIMEOUT_MS, outputTokensOverride?: number): number {
  return priceShape(model, compileShape(model, operativeChars, timeoutMs, outputTokensOverride));
}

export function verifyReservationUsd(model: GatewayModel, timeoutMs = DEFAULT_CANDIDATE_TIMEOUT_MS): number {
  return priceShape(model, verifyShape(model, timeoutMs));
}

/** Compile and verify are reserved one after the other; this is the most a single candidate can hold. */
export function candidateMaxReservationUsd(model: GatewayModel, operativeChars: number, timeoutMs = DEFAULT_CANDIDATE_TIMEOUT_MS): number {
  return Number((compileReservationUsd(model, operativeChars, timeoutMs) + verifyReservationUsd(model, timeoutMs)).toFixed(8));
}

/** Health probes (gateway-health.ts): fixed prompts and fixed max_tokens, so the reservation is exact arithmetic. */
export const PROBE_A_PROMPT_CHARS = "Reply with the single word OK.".length;
export const PROBE_A_MAX_TOKENS = 32;
export const PROBE_B_SENTENCE = "Section 7.2 — The Borrower shall not incur Indebtedness exceeding $50,000,000. ";
export const PROBE_B_REPEATS = 220;
export const PROBE_B_PREAMBLE_CHARS = "Call emit_rules once for this provision.\n\n".length;
export const PROBE_B_MAX_TOKENS = 1024;
/** Allowance for the tool definition and message framing the probe sends beside its prose. */
export const PROBE_FRAMING_TOKENS = 500;
export function probeReservationUsd(model: GatewayModel): { tierA: number; tierB: number; both: number } {
  const inA = Math.ceil(PROBE_A_PROMPT_CHARS * CALIBRATED_TOKENS_PER_CHAR) + PROBE_FRAMING_TOKENS;
  const inB = Math.ceil((PROBE_B_PREAMBLE_CHARS + PROBE_B_SENTENCE.length * PROBE_B_REPEATS) * CALIBRATED_TOKENS_PER_CHAR) + PROBE_FRAMING_TOKENS;
  const tierA = Number((inA * Number(model.pricing.input) + PROBE_A_MAX_TOKENS * Number(model.pricing.output)).toFixed(8));
  const tierB = Number((inB * Number(model.pricing.input) + PROBE_B_MAX_TOKENS * Number(model.pricing.output)).toFixed(8));
  return { tierA, tierB, both: Number((tierA + tierB).toFixed(8)) };
}

/**
 * Enforcement: did an executed call exceed the shape it was reserved for? Any reason here means the
 * declared cap was wrong for this population and the run must stop before another dispatch.
 */
export function shapeExceeded(observed: { attemptCount: number | null; inputTokens: number | null; outputTokens: number | null }, shape: ReservationShape): string[] {
  const reasons: string[] = [];
  if ((observed.attemptCount ?? 0) > shape.conversations && shape.conversations > 0) reasons.push(`conversations ${observed.attemptCount} > reserved ${shape.conversations}`);
  if ((observed.inputTokens ?? 0) > shape.inputTokens) reasons.push(`input tokens ${observed.inputTokens} > reserved ${shape.inputTokens}`);
  if ((observed.outputTokens ?? 0) > shape.outputTokens) reasons.push(`output tokens ${observed.outputTokens} > reserved ${shape.outputTokens}`);
  return reasons;
}
