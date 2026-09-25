/**
 * The paid candidate loop, extracted from run-population-verified.ts so its termination and budget
 * behaviour can be pinned by tests against stubbed compile/verify executions - zero paid calls.
 *
 * Invariants (P-6 / P-7):
 *   - before EVERY dispatch (compile and verify alike) the ledger's hard invariant holds:
 *     committed + outstanding + next reservation <= ceiling, and STOP_AT is not crossed; otherwise the
 *     run stops BEFORE the request begins (BUDGET_STOP);
 *   - a positively identified gateway credit exhaustion (HTTP 402 / insufficient_funds - see
 *     gateway-credit.ts) records the current candidate honestly, settles its cost from provider
 *     telemetry ($0 exact when nothing was served), persists it, flushes, and STOPS THE RUN. No
 *     further candidate is dispatched, no retry, no alternate provider, no fallback model;
 *   - a compile whose telemetry exceeds the reserved execution shape stops the run after settling
 *     (RESERVATION_SHAPE_EXCEEDED): the declared cap was wrong and the next reservation cannot be
 *     trusted to cover the next call;
 *   - an ordinary provider failure (500, transport), a schema failure and a wall-clock timeout are
 *     recorded outcomes of ONE candidate; the loop continues.
 *
 * Harness only. Nothing in the production pipeline imports it.
 */
import type { CostRecord } from "./timeout-policy";
import { accountForRequest, BudgetLedger } from "./timeout-policy";
import type { GatewayModel } from "./probe-models";
import type { Outcome } from "./run-population";
import { classifyOutcome } from "./run-population";
import type { CandidateRecord } from "./compile-run";
import { detectCreditExhaustionInError, detectCreditExhaustionInResult, GATEWAY_CREDIT_EXHAUSTED, type CreditExhaustionSignal } from "./gateway-credit";
import { shapeExceeded, type ReservationShape } from "./reservation-policy";

export type VerifyOutcome = "COMPLETED" | "TIMEOUT" | "EXECUTION_FAILURE" | "NOT_RUN_COMPILE_FAILED";
export type StopReason = "COMPLETED" | typeof GATEWAY_CREDIT_EXHAUSTED | "BUDGET_STOP" | "RESERVATION_SHAPE_EXCEEDED";

export interface AttemptStatus {
  discoveryId: string;
  ref: string;
  operativeChars: number;
  compile: { outcome: Outcome; status: string; failureReasons: string[]; wallClockMs: number | null; inputTokens: number | null; outputTokens: number | null; costUsd: number; costStatus: string; passAUsage?: { inputTokens: number; outputTokens: number } | null; reservationUsd?: number; shapeExceeded?: string[] };
  verify: { outcome: VerifyOutcome; status: string | null; semanticReviewInvoked: boolean | null; findings: number | null; sideCalls: { stage: string; inputTokens: number | null; outputTokens: number | null; costUsd: number }[]; costUsd: number; costStatus: string | null; wallClockMs: number | null; reservationUsd?: number };
  package: { complete: boolean; artifactsPersisted: number; unitsMissingVerification: number; problems: string[]; packageHash: string; file: string | null } | null;
  evidenceFile: string | null;
  committedUsd: number;
  /** Set on the candidate whose request positively identified gateway credit exhaustion. */
  creditExhaustion?: CreditExhaustionSignal;
}

export interface LoopCandidate { discoveryId: string; ref: string; operativeChars: number }

/** What one compile attempt produced, as the runner observes it (the compiler's result plus harness telemetry). */
export interface CompileExecution {
  result: { status: string; failureReasons?: readonly string[] | null; unresolvedIssues?: readonly string[] | null; errorDetail?: unknown; telemetry?: { attemptCount?: number | null } | null };
  rec: Pick<CandidateRecord, "status" | "failureReasons" | "inputTokens" | "outputTokens" | "wallClockMs" | "rules" | "definitions" | "toolCalls">;
  timedOut: boolean;
  threw: boolean;
  thrown?: unknown;
  /** Pass A inventory usage observed through the harness's recorded stage caller (null when none was seen). */
  passAUsage: { inputTokens: number; outputTokens: number } | null;
  /** Credit-exhaustion signal from the response sentinel or a structured error, if the harness saw one. */
  signal: CreditExhaustionSignal | null;
}

export interface VerifyExecution {
  verification: { status: string; semanticReviewInvoked?: boolean; findings: unknown[] } | null;
  outcome: VerifyOutcome;
  timedOut: boolean;
  thrown?: unknown;
  usage: { inputTokens: number; outputTokens: number } | null;
  sideCalls: AttemptStatus["verify"]["sideCalls"];
  wallClockMs: number;
  signal: CreditExhaustionSignal | null;
}

export interface LoopDeps {
  candidates: LoopCandidate[];
  ledger: BudgetLedger;
  model: GatewayModel;
  compileShape: (c: LoopCandidate) => ReservationShape;
  verifyShape: (c: LoopCandidate) => ReservationShape;
  compileReservationUsd: (c: LoopCandidate) => number;
  verifyReservationUsd: (c: LoopCandidate) => number;
  compile: (c: LoopCandidate) => Promise<CompileExecution>;
  verify: (c: LoopCandidate, compile: CompileExecution) => Promise<VerifyExecution>;
  /** Persist evidence + paired package; returns the status fragments or null when persistence was refused. */
  persist: (c: LoopCandidate, compile: CompileExecution, verify: VerifyExecution | null, costs: { compile: CostRecord; verify: CostRecord | null }) => { package: AttemptStatus["package"]; evidenceFile: string | null } | null;
  /** Durable flush of everything so far; called after every terminal candidate and at every stop. */
  flush: (state: LoopState) => void;
  log?: (line: string) => void;
  now?: () => string;
}

export interface LoopState {
  statuses: AttemptStatus[];
  costs: (CostRecord & { discoveryId: string; stage: "compile" | "verify" })[];
  stop: { reason: StopReason; candidateAtStop: string | null; at: string; committedUsd: number; remainingCandidates: string[]; detail: string | null; signal: CreditExhaustionSignal | null } | null;
}

const zeroUsage = (u: { inputTokens: number | null; outputTokens: number | null }) => (u.inputTokens ?? 0) + (u.outputTokens ?? 0) === 0;

export async function runCandidateLoop(deps: LoopDeps): Promise<LoopState> {
  const { ledger, model } = deps;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date().toISOString());
  const state: LoopState = { statuses: [], costs: [], stop: null };
  const stopRun = (reason: StopReason, candidateAtStop: string | null, index: number, detail: string | null, signal: CreditExhaustionSignal | null) => {
    state.stop = { reason, candidateAtStop, at: now(), committedUsd: ledger.committedUsd, remainingCandidates: deps.candidates.slice(index).map((c) => c.ref), detail, signal };
    log(`RUN STOP ${reason}${candidateAtStop ? ` at ${candidateAtStop}` : ""}: ${detail ?? ""} committed=$${ledger.committedUsd.toFixed(4)} remaining=${state.stop.remainingCandidates.length}`);
    deps.flush(state);
  };

  for (let i = 0; i < deps.candidates.length; i++) {
    const candidate = deps.candidates[i]!;
    // ---- compile: hard invariant BEFORE the request begins ----
    const compileReservation = deps.compileReservationUsd(candidate);
    const decision = ledger.reserveOrRefuse(`${candidate.discoveryId}:compile`, compileReservation);
    if (!decision.allowed) { stopRun("BUDGET_STOP", null, i, `${decision.reason}: committed $${decision.committedUsd} + reservation $${compileReservation} would be $${decision.wouldCommitUsd} against ceiling $${decision.ceilingUsd} / STOP_AT $${decision.stopAtUsd}; ${candidate.ref} not dispatched`, null); return state; }

    const ce = await deps.compile(candidate);
    const shardUsage = zeroUsage(ce.rec) ? null : { inputTokens: ce.rec.inputTokens ?? 0, outputTokens: ce.rec.outputTokens ?? 0 };
    const usage = shardUsage || ce.passAUsage ? { inputTokens: (shardUsage?.inputTokens ?? 0) + (ce.passAUsage?.inputTokens ?? 0), outputTokens: (shardUsage?.outputTokens ?? 0) + (ce.passAUsage?.outputTokens ?? 0) } : null;
    const signal = ce.signal ?? detectCreditExhaustionInError(ce.thrown) ?? detectCreditExhaustionInResult(ce.result);
    const providerFailed = ce.threw || (ce.rec.failureReasons ?? []).includes("PROVIDER_FAILURE") || (ce.rec.failureReasons ?? []).includes("TRANSPORT_OR_INTERNAL_ERROR");
    // zero tokens after a provider failure (thrown OR reported by the compiler) is a refusal: nothing served, nothing billed
    const compileCost = accountForRequest({ model, elapsedWallClockMs: ce.rec.wallClockMs ?? 0, timedOut: ce.timedOut, providerUsage: usage, streamedOutputTokensObserved: ce.rec.outputTokens, reservationUsd: compileReservation, providerRefused: !ce.timedOut && !usage && providerFailed });
    ledger.settle(`${candidate.discoveryId}:compile`, compileCost);
    state.costs.push({ ...compileCost, discoveryId: candidate.discoveryId, stage: "compile" });
    const compileOutcome = classifyOutcome({ ...ce.rec, inputTokens: usage?.inputTokens ?? ce.rec.inputTokens, outputTokens: usage?.outputTokens ?? ce.rec.outputTokens } as CandidateRecord, ce.timedOut);
    const exceeded = shapeExceeded({ attemptCount: ce.result.telemetry?.attemptCount ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null }, deps.compileShape(candidate));

    // ---- verify: only a completed compile, never after credit exhaustion, and only through the invariant ----
    let ve: VerifyExecution | null = null;
    let verifyCost: CostRecord | null = null;
    let verifyReservation: number | undefined;
    let verifyBudgetStop: string | null = null;
    if (compileOutcome === "COMPLETED" && !signal) {
      verifyReservation = deps.verifyReservationUsd(candidate);
      const vd = ledger.reserveOrRefuse(`${candidate.discoveryId}:verify`, verifyReservation);
      if (!vd.allowed) verifyBudgetStop = `${vd.reason}: verify reservation $${verifyReservation} would commit $${vd.wouldCommitUsd} against ceiling $${vd.ceilingUsd} / STOP_AT $${vd.stopAtUsd}; ${candidate.ref} compiled but NOT verified`;
      else {
        ve = await deps.verify(candidate, ce);
        verifyCost = accountForRequest({ model, elapsedWallClockMs: ve.wallClockMs, timedOut: ve.timedOut, providerUsage: ve.usage, streamedOutputTokensObserved: ve.usage?.outputTokens ?? null, reservationUsd: verifyReservation, providerRefused: !ve.timedOut && !ve.usage && ve.outcome !== "COMPLETED" });
        ledger.settle(`${candidate.discoveryId}:verify`, verifyCost);
        state.costs.push({ ...verifyCost, discoveryId: candidate.discoveryId, stage: "verify" });
      }
    }
    const verifySignal = ve ? (ve.signal ?? detectCreditExhaustionInError(ve.thrown)) : null;

    // ---- persist + record, whatever happened ----
    const persisted = deps.persist(candidate, ce, ve, { compile: compileCost, verify: verifyCost });
    const status: AttemptStatus = {
      discoveryId: candidate.discoveryId, ref: candidate.ref, operativeChars: candidate.operativeChars,
      compile: { outcome: compileOutcome, status: ce.rec.status, failureReasons: [...(ce.rec.failureReasons ?? [])], wallClockMs: ce.rec.wallClockMs, inputTokens: usage?.inputTokens ?? ce.rec.inputTokens, outputTokens: usage?.outputTokens ?? ce.rec.outputTokens, costUsd: compileCost.chargedToBudgetUsd, costStatus: compileCost.costAccountingStatus, passAUsage: ce.passAUsage, reservationUsd: compileReservation, ...(exceeded.length > 0 ? { shapeExceeded: exceeded } : {}) },
      verify: { outcome: ve?.outcome ?? "NOT_RUN_COMPILE_FAILED", status: ve?.verification?.status ?? null, semanticReviewInvoked: ve?.verification?.semanticReviewInvoked ?? null, findings: ve?.verification ? ve.verification.findings.length : null, sideCalls: ve?.sideCalls ?? [], costUsd: verifyCost?.chargedToBudgetUsd ?? 0, costStatus: verifyCost?.costAccountingStatus ?? null, wallClockMs: ve?.wallClockMs ?? null, ...(verifyReservation !== undefined ? { reservationUsd: verifyReservation } : {}) },
      package: persisted?.package ?? null, evidenceFile: persisted?.evidenceFile ?? null,
      committedUsd: ledger.committedUsd,
      ...(signal ?? verifySignal ? { creditExhaustion: (signal ?? verifySignal)! } : {}),
    };
    state.statuses.push(status);
    log(`  [${i + 1}/${deps.candidates.length}] ${candidate.ref.padEnd(14)} compile=${compileOutcome.padEnd(18)} verify=${status.verify.outcome.padEnd(22)} pkg=${persisted ? (persisted.package?.complete ? "complete" : "incomplete") : "NOT_WRITTEN"} committed=$${ledger.committedUsd.toFixed(4)}`);
    deps.flush(state);

    // ---- terminal run conditions, evaluated only after the candidate is recorded and durable ----
    if (signal ?? verifySignal) { stopRun(GATEWAY_CREDIT_EXHAUSTED, candidate.ref, i + 1, `gateway refused with HTTP ${(signal ?? verifySignal)!.httpStatus ?? "?"} ${(signal ?? verifySignal)!.errorType ?? ""} (${(signal ?? verifySignal)!.source}) during ${signal ? "compile" : "verify"}; no further candidate dispatched`, signal ?? verifySignal); return state; }
    if (exceeded.length > 0) { stopRun("RESERVATION_SHAPE_EXCEEDED", candidate.ref, i + 1, exceeded.join("; "), null); return state; }
    if (verifyBudgetStop) { stopRun("BUDGET_STOP", candidate.ref, i + 1, verifyBudgetStop, null); return state; }
  }
  state.stop = { reason: "COMPLETED", candidateAtStop: null, at: now(), committedUsd: ledger.committedUsd, remainingCandidates: [], detail: null, signal: null };
  deps.flush(state);
  return state;
}
