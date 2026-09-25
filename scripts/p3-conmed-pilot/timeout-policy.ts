/**
 * Timeout policy and honest cost accounting for the paid cheap-model harness.
 *
 * This module exists because of a specific, measured failure: eleven candidates ran for a
 * full 900s, were billed by the provider, and were recorded locally as $0.00 — because a
 * request that never returns yields no usage object. The mission's $5 ceiling was therefore
 * being enforced against a number that omitted the most expensive requests in the run.
 *
 * Two rules follow, and both are structural rather than advisory:
 *   1. a timeout with no billing metadata is UNKNOWN_TIMEOUT_BILLED, never $0.00;
 *   2. budget is RESERVED before dispatch and a reservation for an unbilled timeout is
 *      never released, so invisible spend consumes the ceiling instead of defeating it.
 *
 * Harness/evaluation control only. Nothing in the production compiler imports this.
 */
import type { GatewayModel } from "./probe-models";

/**
 * §1 — 480s, down from 900s.
 *
 * Chosen from the observed distribution, not picked round: the slowest SUCCESSFUL probe
 * across both admissible model rows finished at 427s (7.13 on qwen3.7-flash). 480s keeps
 * the entire observed success distribution intact while cutting worst-case hidden spend
 * per non-converging candidate by nearly half.
 */
export const DEFAULT_CANDIDATE_TIMEOUT_MS = 480_000;

/** §4 — the only ceiling a retry may use, and only when separately authorized. */
export const LONG_RETRY_CEILING_MS = 900_000;

/** §5 — no paid request may run this long without separate authorization. */
export const FORBIDDEN_LONG_CALL_MS = 1_800_000;

/**
 * Qualification-stage ceiling — 240s, explicitly authorized for MODEL SCREENING only.
 *
 * Screening asks a different question from corpus execution: not "can this model finish
 * the work" but "can it demonstrate the protocol at all". A model that cannot show
 * structured output, tool use and convergence inside four minutes should not be granted
 * hundreds of paid candidates on the chance it eventually would. It is deliberately
 * BELOW the population floor and may only be used with tier: "QUALIFICATION".
 */
export const QUALIFICATION_TIMEOUT_MS = 240_000;

/** §1 forbids lowering the POPULATION ceiling further within this mission. */
export const MIN_ALLOWED_TIMEOUT_MS = DEFAULT_CANDIDATE_TIMEOUT_MS;

export const SLOWEST_OBSERVED_SUCCESS_MS = 427_000;

/**
 * §7 — the output rate the reservation assumes, rounded UP past every rate measured.
 *
 * History of the measurement, because the guard is only as good as this number:
 *   - bake-off: the fastest sustained rate across the admissible rows was 120.2 tok/s
 *     (mercury-2.5 on 7.8(b)); reserved at 125.
 *   - benchmark recovery, 2026-09-25, deepseek/deepseek-v4-flash on 7.16: the Pass A inventory
 *     calls alone returned 63,943 output tokens inside the 480 s ceiling, i.e. AT LEAST 133.2 tok/s
 *     sustained (the calls finished before the cut-off, so the true rate is higher and unknowable
 *     from the evidence). The P-7 shape guard stopped that run (RESERVATION_SHAPE_EXCEEDED), which
 *     is exactly what it exists for. Reserved at 200 from then on: a 50% margin over the measured
 *     lower bound. The reservation FORMULA is unchanged; this is the one empirical input it takes.
 *
 * Reserving at this rate means a candidate held for the full ceiling cannot bill more output than
 * we set aside, which is the property the guard needs. Reserving too little would reintroduce
 * exactly the hole this module exists to close.
 */
export const OBSERVED_OUTPUT_TOKENS_PER_SECOND = 200;
/** The measured lower bound that forced the 2026-09-25 recalibration (63,943 tokens / 480 s). */
export const MEASURED_OUTPUT_TOKENS_PER_SECOND_LOWER_BOUND = 63_943 / 480;

export type CostAccountingStatus =
  | "EXACT"
  | "ESTIMATED_FROM_STREAM"
  | "UNKNOWN_TIMEOUT_BILLED"
  | "PROVIDER_REFUSED_NO_COST";

export type TimeoutClassification = "TIMEOUT_480" | "TIMEOUT_PROGRESSING_RETRY_ELIGIBLE" | "TIMEOUT_NONCONVERGENT";

/**
 * Evidence captured BEFORE termination. It is what distinguishes a model that was working
 * from one that was idling, and §3 makes that distinction the sole basis for retry
 * eligibility — never the desirability of the answer.
 */
export interface ProgressEvidence {
  outputTokensObserved: number;
  toolCallsCompleted: number;
  structuredOutputItems: number;
  lastActivityMsBeforeTermination: number | null;
}

export const NO_PROGRESS: ProgressEvidence = { outputTokensObserved: 0, toolCallsCompleted: 0, structuredOutputItems: 0, lastActivityMsBeforeTermination: null };

/** Activity within this window of termination counts as "still going" rather than stalled. */
export const RECENT_ACTIVITY_WINDOW_MS = 60_000;

/**
 * §3 — was the model genuinely progressing when we cut it off?
 *
 * Deliberately conservative: absent evidence means NOT eligible. A retry costs real money
 * against a ceiling we already know under-measures itself, so the default must be no.
 */
export function classifyTimeout(evidence: ProgressEvidence): TimeoutClassification {
  const producing = evidence.outputTokensObserved > 0;
  const recentlyActive = evidence.lastActivityMsBeforeTermination !== null && evidence.lastActivityMsBeforeTermination <= RECENT_ACTIVITY_WINDOW_MS;
  const didRealWork = evidence.toolCallsCompleted > 0 || evidence.structuredOutputItems > 0;

  if ((producing && recentlyActive) || (didRealWork && producing)) return "TIMEOUT_PROGRESSING_RETRY_ELIGIBLE";
  if (!producing && !didRealWork) return "TIMEOUT_NONCONVERGENT";
  return "TIMEOUT_NONCONVERGENT";
}

/** §2 — a timeout is a measured outcome. Nothing about it authorizes another dispatch. */
export function mayAutomaticallyRetry(): false {
  return false;
}

/** §4 — a longer retry is a separately reported and authorized batch, never automatic. */
export function mayRunLongRetryAutomatically(): false {
  return false;
}

export class ForbiddenTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenTimeoutError";
  }
}

/**
 * §1/§5 — the only gate through which a paid ceiling may be set.
 *
 * Rejects anything at or above 1800s outright, rejects a long retry that was not explicitly
 * authorized, and rejects attempts to tighten below 480s (which §1 forbids in this mission).
 */
export function assertAllowedTimeout(ms: number, opts: { longRetryAuthorized?: boolean; tier?: "POPULATION" | "QUALIFICATION" } = {}): void {
  // The qualification tier is a separate, narrower authorization: one fixed ceiling, no
  // retry, and no access to the long-retry path. It cannot be used to smuggle in an
  // arbitrary shorter population timeout.
  if (opts.tier === "QUALIFICATION") {
    if (ms !== QUALIFICATION_TIMEOUT_MS) {
      throw new ForbiddenTimeoutError(`qualification runs use exactly ${QUALIFICATION_TIMEOUT_MS}ms; ${ms}ms is not authorized`);
    }
    if (opts.longRetryAuthorized) {
      throw new ForbiddenTimeoutError("a qualification probe may not be combined with long-retry authorization");
    }
    return;
  }
  if (ms >= FORBIDDEN_LONG_CALL_MS) {
    throw new ForbiddenTimeoutError(`${ms}ms is at or above the ${FORBIDDEN_LONG_CALL_MS}ms hard limit; §5 forbids it without separate authorization`);
  }
  if (ms > DEFAULT_CANDIDATE_TIMEOUT_MS) {
    if (!opts.longRetryAuthorized) {
      throw new ForbiddenTimeoutError(`${ms}ms exceeds the ${DEFAULT_CANDIDATE_TIMEOUT_MS}ms default; a longer ceiling requires an explicitly authorized retry batch (§4)`);
    }
    if (ms > LONG_RETRY_CEILING_MS) {
      throw new ForbiddenTimeoutError(`${ms}ms exceeds the ${LONG_RETRY_CEILING_MS}ms long-retry ceiling (§4)`);
    }
  }
  if (ms < MIN_ALLOWED_TIMEOUT_MS) {
    throw new ForbiddenTimeoutError(`${ms}ms is below the ${MIN_ALLOWED_TIMEOUT_MS}ms floor; §1 forbids lowering it further in this mission`);
  }
}

export interface CostRecord {
  model: string;
  elapsedWallClockMs: number;
  streamedOutputTokensObserved: number | null;
  providerUsageObserved: { inputTokens: number; outputTokens: number } | null;
  locallyCalculatedCostUsd: number;
  finalProviderBillingUnavailable: boolean;
  costAccountingStatus: CostAccountingStatus;
  /** What this request must be charged against the ceiling — never 0 for an unbilled timeout. */
  chargedToBudgetUsd: number;
}

/**
 * §6 — classify and price one request honestly.
 *
 * The critical branch is the timeout with no usage object. Previously that produced
 * $0.00; it now produces UNKNOWN_TIMEOUT_BILLED and is charged at the conservative
 * reservation, because we know the provider billed something and cannot know what.
 */
export function accountForRequest(args: {
  model: GatewayModel;
  elapsedWallClockMs: number;
  timedOut: boolean;
  providerUsage: { inputTokens: number; outputTokens: number } | null;
  streamedOutputTokensObserved: number | null;
  reservationUsd: number;
  providerRefused?: boolean;
}): CostRecord {
  const { model, elapsedWallClockMs, timedOut, providerUsage, streamedOutputTokensObserved, reservationUsd, providerRefused } = args;
  const price = (inTok: number, outTok: number) => inTok * Number(model.pricing.input) + outTok * Number(model.pricing.output);

  // A refusal is the one case where zero really is zero: nothing was served, nothing billed.
  if (providerRefused && !providerUsage && (streamedOutputTokensObserved ?? 0) === 0) {
    return {
      model: model.id, elapsedWallClockMs, streamedOutputTokensObserved: streamedOutputTokensObserved ?? 0, providerUsageObserved: null,
      locallyCalculatedCostUsd: 0, finalProviderBillingUnavailable: false, costAccountingStatus: "PROVIDER_REFUSED_NO_COST", chargedToBudgetUsd: 0,
    };
  }

  if (providerUsage) {
    const exact = price(providerUsage.inputTokens, providerUsage.outputTokens);
    return {
      model: model.id, elapsedWallClockMs, streamedOutputTokensObserved, providerUsageObserved: providerUsage,
      locallyCalculatedCostUsd: exact, finalProviderBillingUnavailable: false, costAccountingStatus: "EXACT", chargedToBudgetUsd: exact,
    };
  }

  if (timedOut) {
    // Some tokens were observed mid-stream: price what we saw, but this is a floor, not the
    // bill. The input side alone is unknown, so the reservation still governs the charge.
    const streamed = streamedOutputTokensObserved ?? 0;
    const estimated = streamed > 0 ? price(0, streamed) : 0;
    return {
      model: model.id, elapsedWallClockMs, streamedOutputTokensObserved, providerUsageObserved: null,
      locallyCalculatedCostUsd: estimated,
      finalProviderBillingUnavailable: true,
      costAccountingStatus: "UNKNOWN_TIMEOUT_BILLED",
      // Never below the reservation: the provider generated for the full ceiling.
      chargedToBudgetUsd: Math.max(estimated, reservationUsd),
    };
  }

  const streamed = streamedOutputTokensObserved ?? 0;
  const estimated = price(0, streamed);
  return {
    model: model.id, elapsedWallClockMs, streamedOutputTokensObserved, providerUsageObserved: null,
    locallyCalculatedCostUsd: estimated, finalProviderBillingUnavailable: true,
    costAccountingStatus: "ESTIMATED_FROM_STREAM", chargedToBudgetUsd: estimated,
  };
}

/**
 * §7 — reserve before dispatch, release only against exact billing.
 *
 * The ledger's `committed` is what the spend guard must read. An unbilled timeout keeps
 * its reservation forever, which is the entire point: it is the mechanism that stops
 * invisible spend from defeating the ceiling.
 */
export class BudgetLedger {
  private exact = 0;
  private retained = 0;
  private outstanding = new Map<string, number>();

  constructor(readonly ceilingUsd: number, readonly stopAtUsd: number) {}

  /** Conservative per-candidate maximum for a cheap model at the full ceiling. */
  static reservationFor(model: GatewayModel, timeoutMs: number, observedInputTokens: number, observedOutputTokensPerSecond: number): number {
    const seconds = timeoutMs / 1000;
    const outTok = Math.ceil(seconds * observedOutputTokensPerSecond);
    return observedInputTokens * Number(model.pricing.input) + outTok * Number(model.pricing.output);
  }

  reserve(id: string, usd: number): void {
    this.outstanding.set(id, (this.outstanding.get(id) ?? 0) + usd);
  }

  /** Settle a request. An UNKNOWN_TIMEOUT_BILLED reservation is retained, not released. */
  settle(id: string, record: CostRecord): void {
    const reserved = this.outstanding.get(id) ?? 0;
    this.outstanding.delete(id);
    if (record.costAccountingStatus === "UNKNOWN_TIMEOUT_BILLED") {
      this.retained += Math.max(reserved, record.chargedToBudgetUsd);
      return;
    }
    if (record.costAccountingStatus === "PROVIDER_REFUSED_NO_COST") return;
    this.exact += record.chargedToBudgetUsd;
  }

  /** Exactly-billed spend. Understates the true bill; never use it for the guard. */
  get exactSpendUsd(): number {
    return Number(this.exact.toFixed(6));
  }

  /** Spend known to have happened but not exactly priced. */
  get retainedUnknownUsd(): number {
    return Number(this.retained.toFixed(6));
  }

  get outstandingReservedUsd(): number {
    return Number([...this.outstanding.values()].reduce((s, x) => s + x, 0).toFixed(6));
  }

  /** What the spend guard reads: everything spent, retained, or currently at risk. */
  get committedUsd(): number {
    return Number((this.exact + this.retained + this.outstandingReservedUsd).toFixed(6));
  }

  get remainingUsd(): number {
    return Number((this.ceilingUsd - this.committedUsd).toFixed(6));
  }

  /** True when a further dispatch would risk crossing the stop line. */
  mustStop(nextReservationUsd = 0): boolean {
    return this.committedUsd + nextReservationUsd >= this.stopAtUsd;
  }

  /**
   * P-7 HARD BUDGET INVARIANT, checked before every dispatch:
   *
   *     committed (exact + retained + outstanding reservations) + next reservation <= hard ceiling
   *
   * and the STOP_AT line is not crossed. A request never begins because the historical average cost
   * is low: only the reservation for the maximum shape the runner permits counts here.
   */
  dispatchDecision(nextReservationUsd: number): { allowed: boolean; reason: "OK" | "HARD_CEILING" | "STOP_AT"; committedUsd: number; nextReservationUsd: number; wouldCommitUsd: number; ceilingUsd: number; stopAtUsd: number } {
    // compared unrounded: a reservation that exceeds the ceiling by less than a micro-dollar is still over it
    const wouldCommitRaw = this.committedUsd + nextReservationUsd;
    const wouldCommitUsd = Number(wouldCommitRaw.toFixed(6));
    const base = { committedUsd: this.committedUsd, nextReservationUsd, wouldCommitUsd, ceilingUsd: this.ceilingUsd, stopAtUsd: this.stopAtUsd };
    if (wouldCommitRaw > this.ceilingUsd) return { allowed: false, reason: "HARD_CEILING", ...base };
    if (this.mustStop(nextReservationUsd)) return { allowed: false, reason: "STOP_AT", ...base };
    return { allowed: true, reason: "OK", ...base };
  }

  /** Reserve only through the invariant; throws rather than letting a request begin over the ceiling. */
  reserveOrRefuse(id: string, usd: number): ReturnType<BudgetLedger["dispatchDecision"]> {
    const d = this.dispatchDecision(usd);
    if (d.allowed) this.reserve(id, usd);
    return d;
  }

  snapshot() {
    return {
      ceilingUsd: this.ceilingUsd,
      stopAtUsd: this.stopAtUsd,
      exactSpendUsd: this.exactSpendUsd,
      retainedUnknownTimeoutUsd: this.retainedUnknownUsd,
      outstandingReservedUsd: this.outstandingReservedUsd,
      committedUsd: this.committedUsd,
      remainingUsd: this.remainingUsd,
    };
  }
}
