/**
 * CONMED CURRENT-PIPELINE RESUME - compile AND verify, with paired verified-unit persistence.
 *
 * This is the execution entry point the resume manifest (docs/phase-3-conmed-resume/02-execution-
 * manifest.json) names. It does not run unless CONMED_RESUME_AUTHORIZED=1 is set by a mission that
 * explicitly authorizes paid calls; `--dry-run` computes the plan offline with the credential
 * removed from the process and dispatches nothing.
 *
 * Fixed by the manifest and enforced here, not by care:
 *   model      deepseek/deepseek-v4-flash, no suffix, asserted non-premium, ANALYZER_MODEL pinned
 *              so the amendment pipeline and both verifier gates cannot fall to a premium default;
 *   timeout    480 s per compile call and per verifier call (withTimeout), never raised;
 *   retries    none, on any outcome; concurrency 1, with no escalation code path at all;
 *   budget     reserve-before-dispatch, UNKNOWN_TIMEOUT_BILLED retained, no call starts once
 *              committed + reservation >= STOP_AT, ceiling never crossed;
 *   evidence   persistCandidate writes the forensic evidence AND the paired verified-unit package
 *              from the same in-memory objects for every attempted candidate; a run manifest is
 *              rewritten every 10 candidates and at the end.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller, type StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { SemanticVerificationResult } from "../../lib/contract-model/compiler/semantic-verification/types";
import { snapshotUnitsForVerification } from "../../lib/contract-model/verified-units";
import { COMPANY_ID, INSTRUMENT_KEY, operativeTextFor } from "./pipeline";
import { dedupExact } from "./dedup";
import { PER_CANDIDATE_TIMEOUT_MS, buildInput, callerFor, loadModel, maxTokensFor, prepare, realCost, record, withTimeout, type CandidateRecord } from "./compile-run";
import { assertNotPremium, PREMIUM_MODEL_BUDGET_USD } from "./premium-lock";
import { BudgetLedger, accountForRequest, type CostRecord } from "./timeout-policy";
import { persistCandidate, VerifiedUnitManifestWriter } from "./evidence";
import { detectCreditExhaustionInError, GatewayResponseSentinel, type CreditExhaustionSignal } from "./gateway-credit";
import { compileReservationUsd, compileShape, MAX_FIRST_TURN_INPUT_TOKENS_REEXPORT, outputTokensCap, verifyReservationUsd, verifyShape, MAX_RESERVED_CONVERSATIONS, TURNS_PER_CONVERSATION } from "./reservation-policy";
import { runCandidateLoop, type AttemptStatus, type CompileExecution, type VerifyExecution, type VerifyOutcome } from "./population-loop";
export type { AttemptStatus, VerifyOutcome } from "./population-loop";

/** Output directory. CONMED_RUN_OUT lets a continuation write beside, never over, the original run. */
export const OUT = process.env.CONMED_RUN_OUT ?? "/tmp/claude-0/pilot/population-verified";
export const LOCKED_MODEL = "deepseek/deepseek-v4-flash";
export const FORBIDDEN_MODEL_SUFFIX = "-0731";
/** From docs/phase-3-conmed-resume/01-calibration.json: HARD_WORST_AUTHORIZED $3.29 rounded up to the next $0.25. */
export const SPEND_CEILING_USD = 3.5;
/** Ceiling minus two full (compile reservation + conservative verify) allowances, so an in-flight pair can settle under the ceiling. */
export const SPEND_STOP_AT_USD = 3.450577;
export const CONCURRENCY = 1 as const;
export const AUTO_RETRY = false as const;
export const FALLBACK_MODEL: null = null;

function save(name: string, body: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 2));
}

/** The plan: the exact candidates in the exact order, and the budget arithmetic. Offline; nothing dispatched. */
export async function plan() {
  const { stages, bundles, rehydrated, unresolved } = await prepare();
  const { keep, report } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  const attemptable = keep.filter((c) => operativeTextFor(c, stages.index).length > 0)
    .sort((a, b) => (String(a.normalizedSourceRef) < String(b.normalizedSourceRef) ? -1 : String(a.normalizedSourceRef) > String(b.normalizedSourceRef) ? 1 : a.discoveryId < b.discoveryId ? -1 : 1));
  const skippedEmpty = keep.filter((c) => operativeTextFor(c, stages.index).length === 0).map((c) => ({ discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), reason: "EMPTY_OPERATIVE_TEXT" }));
  return { stages, bundles, keep, attemptable, skippedEmpty, unresolved: unresolved.length, exactDuplicatesRemoved: report.exactDuplicatesRemoved, dedupDenominator: keep.length };
}

/**
 * Continuation controls (harness durability only; model, compile, verify, persistence and status
 * semantics are untouched):
 *   skipDiscoveryIds  candidates that already received their one attempt - asserted never dispatched;
 *   priorSpend        the earlier run's accounted spend, seeded into the ledger so the SAME ceiling governs;
 *   flushEvery        rows between durable flushes (1 = after every terminal candidate, before advancing).
 */
export interface RunPopulationOptions {
  skipDiscoveryIds?: ReadonlySet<string>;
  priorSpend?: { exactUsd: number; retainedUnknownUsd: number; label: string };
  flushEvery?: number;
  runLabel?: string;
}

export async function main(argv: string[] = process.argv.slice(2), opts: RunPopulationOptions = {}) {
  const dryRun = argv.includes("--dry-run");
  const skip = opts.skipDiscoveryIds ?? new Set<string>();
  const flushEvery = opts.flushEvery ?? 1;
  if (dryRun) { delete process.env.AI_GATEWAY_API_KEY; delete process.env.ANTHROPIC_API_KEY; }
  else {
    if (process.env.CONMED_RESUME_AUTHORIZED !== "1") throw new Error("this runner is prepared but not authorized: set CONMED_RESUME_AUTHORIZED=1 in a mission that explicitly authorizes the CONMED resume and its budget");
    if (!process.env.AI_GATEWAY_API_KEY) throw new Error("no gateway credential present");
  }
  if (LOCKED_MODEL.endsWith(FORBIDDEN_MODEL_SUFFIX)) throw new Error("the excluded -0731 model must never be dispatched to");
  if (PREMIUM_MODEL_BUDGET_USD !== 0) throw new Error("PREMIUM_MODEL_BUDGET_USD must be 0");

  // PREMIUM LOCK before any caller exists: the amendment pipeline and both verifier gates resolve
  // ANALYZER_MODEL, and with a gateway key present its default is a premium model.
  process.env.ANALYZER_MODEL = LOCKED_MODEL;
  assertNotPremium(process.env.ANALYZER_MODEL);
  const raw = loadModel(LOCKED_MODEL);
  if (raw.id !== LOCKED_MODEL) throw new Error(`catalogue returned ${raw.id} for ${LOCKED_MODEL}`);
  assertNotPremium(raw.id, raw.pricing);
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(raw));

  const p = await plan();
  // P-7: reservations are derived from the execution shape the runner permits (reservation-policy.ts),
  // per stage, never from a historical average. A single stage call (amendment) is one bounded call.
  const stageCallReservation = Number((MAX_FIRST_TURN_INPUT_TOKENS_REEXPORT * Number(raw.pricing.input) + outputTokensCap(raw, PER_CANDIDATE_TIMEOUT_MS) * Number(raw.pricing.output)).toFixed(8));
  const maxOperativeChars = Math.max(0, ...p.attemptable.map((c) => operativeTextFor(c, p.stages.index).length));
  const reservation = compileReservationUsd(raw, maxOperativeChars, PER_CANDIDATE_TIMEOUT_MS);
  const reservationPolicy = { policy: "reservation-policy.v1 (execution-shape derived; P-7)", compileReservationUsdAtMaxChars: reservation, verifyReservationUsd: verifyReservationUsd(raw, PER_CANDIDATE_TIMEOUT_MS), stageCallReservationUsd: stageCallReservation, compileShapeAtMaxChars: compileShape(raw, maxOperativeChars, PER_CANDIDATE_TIMEOUT_MS), verifyShape: verifyShape(raw, PER_CANDIDATE_TIMEOUT_MS), maxReservedConversations: MAX_RESERVED_CONVERSATIONS, turnsPerConversation: TURNS_PER_CONVERSATION, hardInvariant: "committed + outstanding + next reservation <= ceiling, and STOP_AT not crossed, checked before every dispatch" };
  const runId = `${opts.runLabel ?? "conmed-resume"}-${new Date().toISOString()}`;
  // Continuation pre-flight: a previously attempted candidate can never be dispatched. Asserted on the
  // dispatch list itself, before any provider contact, not left to the loop.
  const dispatch = p.attemptable.filter((c) => !skip.has(c.discoveryId));
  const skippedPrior = p.attemptable.filter((c) => skip.has(c.discoveryId)).map((c) => ({ discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), reason: "PRIOR_ATTEMPT_OR_IN_FLIGHT_UNKNOWN" }));
  for (const c of dispatch) if (skip.has(c.discoveryId)) throw new Error(`pre-flight: previously attempted candidate ${c.discoveryId} is on the dispatch list`);
  if (skip.size > 0 && skippedPrior.length !== skip.size) throw new Error(`pre-flight: skip set names ${skip.size} candidates but only ${skippedPrior.length} are in the attemptable population`);
  const planRecord = {
    runId, model: LOCKED_MODEL, price: { inputPerMtok: Number(raw.pricing.input) * 1e6, outputPerMtok: Number(raw.pricing.output) * 1e6 },
    timeoutMs: PER_CANDIDATE_TIMEOUT_MS, concurrency: CONCURRENCY, autoRetry: AUTO_RETRY, fallbackModel: FALLBACK_MODEL, premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD,
    ceilingUsd: SPEND_CEILING_USD, stopAtUsd: SPEND_STOP_AT_USD, reservationPerCallUsd: reservation, reservationPolicy, flushEvery,
    priorSpend: opts.priorSpend ?? null,
    dedupDenominator: p.dedupDenominator, exactDuplicatesRemoved: p.exactDuplicatesRemoved, attemptable: p.attemptable.length, skippedEmpty: p.skippedEmpty,
    skippedPriorAttempts: skippedPrior, toDispatch: dispatch.length,
    order: dispatch.map((c) => ({ discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), operativeChars: operativeTextFor(c, p.stages.index).length })),
  };
  save("00-plan", planRecord);
  if (dryRun) { console.log(JSON.stringify({ dryRun: true, dispatched: 0, ...planRecord, order: `${planRecord.order.length} candidates` }, null, 1)); return planRecord; }

  // one recorded caller for every non-compiler call (amendment pipeline, Gate 2, Layer 2)
  const sideCalls: { discoveryId: string | null; stage: string; model: string; inputTokens: number | null; outputTokens: number | null; costUsd: number }[] = [];
  let currentCandidate: string | null = null;
  // P-6: the stage analyzer rethrows the SDK's APIError intact (status + body); the first credit-exhaustion
  // signal seen on a stage call is kept here for the loop. The compiler's own client gets a response sentinel.
  let stageSignal: CreditExhaustionSignal | null = null;
  const sentinel = new GatewayResponseSentinel();
  const base = getStageCaller();
  assertNotPremium(base.model);
  const stageCaller: StageCaller = {
    providerName: base.providerName, model: base.model, isSynthetic: base.isSynthetic,
    async call<T>(schema: Parameters<StageCaller["call"]>[0], stage: string, systemPrompt: string, userContent: string): Promise<T> {
      let out: T;
      try { out = (await base.call(schema, stage, systemPrompt, userContent)) as T; }
      catch (err) { stageSignal = stageSignal ?? detectCreditExhaustionInError(err); throw err; }
      const t = base.lastTelemetry();
      if (t) sideCalls.push({ discoveryId: currentCandidate, stage, model: t.model, inputTokens: t.inputTokens, outputTokens: t.outputTokens, costUsd: realCost(raw, t.inputTokens, t.outputTokens) });
      return out;
    },
    lastTelemetry: () => base.lastTelemetry(),
  } as StageCaller;

  const ledger = new BudgetLedger(SPEND_CEILING_USD, SPEND_STOP_AT_USD);
  if (opts.priorSpend) {
    // The earlier run's accounted spend is committed into this ledger through the same reserve/settle
    // path, so the SAME ceiling and STOP_AT govern the whole population: exact as EXACT, timeout and
    // unknown-billing reservations as UNKNOWN_TIMEOUT_BILLED (retained, never released).
    ledger.reserve("prior:exact", opts.priorSpend.exactUsd);
    ledger.settle("prior:exact", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: opts.priorSpend.exactUsd, finalProviderBillingUnavailable: false, costAccountingStatus: "EXACT", chargedToBudgetUsd: opts.priorSpend.exactUsd });
    ledger.reserve("prior:retained", opts.priorSpend.retainedUnknownUsd);
    ledger.settle("prior:retained", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: 0, finalProviderBillingUnavailable: true, costAccountingStatus: "UNKNOWN_TIMEOUT_BILLED", chargedToBudgetUsd: opts.priorSpend.retainedUnknownUsd });
  }
  const verifiedUnits = new VerifiedUnitManifestWriter(path.join(OUT, "evidence"), COMPANY_ID, INSTRUMENT_KEY, runId);
  const statuses: AttemptStatus[] = [];
  const costs: (CostRecord & { discoveryId: string; stage: "compile" | "verify" })[] = [];

  // one-time: amendment pipeline (one bounded stage call, reserved through the hard invariant)
  const amendmentDecision = ledger.reserveOrRefuse("amendment", stageCallReservation);
  if (!amendmentDecision.allowed) throw new Error(`budget invariant refused the amendment call before dispatch: ${JSON.stringify(amendmentDecision)}`);
  const amendment = await runAmendmentPipeline(stageCaller, { documents: p.stages.documents, packageGraph: p.stages.packageGraph, index: p.stages.index });
  const amendmentUsd = sideCalls.filter((s) => s.discoveryId === null).reduce((s, c) => s + c.costUsd, 0);
  ledger.settle("amendment", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: amendmentUsd, finalProviderBillingUnavailable: false, costAccountingStatus: "EXACT", chargedToBudgetUsd: amendmentUsd });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: p.stages.index, allEffects: amendment.effects });

  const state = { statuses, costs, stop: null as null | { reason: string; candidateAtStop: string | null; at: string; committedUsd: number; remainingCandidates: string[]; detail: string | null } };
  const flush = () => { save("01-statuses", statuses); save("02-costs", { snapshot: ledger.snapshot(), perRequest: costs, sideCalls }); verifiedUnits.write(); save("03-run-manifest.checkpoint", { runId, attempted: statuses.length, toDispatch: dispatch.length, committedUsd: ledger.committedUsd, lastCandidate: statuses[statuses.length - 1]?.ref ?? null, stop: state.stop }); };
  const byId = new Map(dispatch.map((c) => [c.discoveryId, c]));
  const inputs = new Map<string, ReturnType<typeof buildInput>>();
  const inputFor = (id: string) => { let input = inputs.get(id); if (!input) { const c = byId.get(id)!; input = buildInput(c, p.bundles.get(id), p.stages, operativeState, amendment.effects); inputs.set(id, input); } return input; };
  const results = new Map<string, { result: SemanticCompilationResult; rec: CandidateRecord; timedOut: boolean }>();
  const verifications = new Map<string, { verification: SemanticVerificationResult | null; snapshot: ReturnType<typeof snapshotUnitsForVerification> }>();

  const loop = await runCandidateLoop({
    candidates: dispatch.map((c) => ({ discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), operativeChars: operativeTextFor(c, p.stages.index).length })),
    ledger, model: raw,
    compileShape: (c) => compileShape(raw, c.operativeChars, PER_CANDIDATE_TIMEOUT_MS),
    verifyShape: () => verifyShape(raw, PER_CANDIDATE_TIMEOUT_MS),
    compileReservationUsd: (c) => compileReservationUsd(raw, c.operativeChars, PER_CANDIDATE_TIMEOUT_MS),
    verifyReservationUsd: () => verifyReservationUsd(raw, PER_CANDIDATE_TIMEOUT_MS),
    compile: async (c): Promise<CompileExecution> => {
      if (skip.has(c.discoveryId)) throw new Error(`refusing to dispatch previously attempted candidate ${c.discoveryId}`);
      const candidate = byId.get(c.discoveryId)!;
      currentCandidate = c.discoveryId; stageSignal = null; sentinel.reset();
      const input = inputFor(c.discoveryId);
      const before = sideCalls.length;
      const t0 = Date.now();
      let result: SemanticCompilationResult; let rec: CandidateRecord; let timedOut = false; let threw = false; let thrown: unknown;
      try {
        // Pass A goes through the runner's RECORDED stage caller (same locked model) so its usage is billed
        // into this candidate's compile settlement instead of vanishing into an unrecorded getStageCaller().
        result = await withTimeout(compileCovenantToIR(input, { caller: callerFor(LOCKED_MODEL, sentinel.fetch), inventoryCaller: stageCaller }), PER_CANDIDATE_TIMEOUT_MS);
        rec = record(candidate, input, result, raw, 1, null);
      } catch (err) {
        threw = true; thrown = err;
        timedOut = err instanceof Error && err.name === "CandidateTimeoutError";
        result = { status: "FAILED", failureReasons: [timedOut ? "WALL_CLOCK_TIMEOUT" : "TRANSPORT_OR_INTERNAL_ERROR"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult;
        rec = record(candidate, input, result, raw, 1, null);
      }
      if (rec.wallClockMs === null) rec.wallClockMs = Date.now() - t0;
      const passA = sideCalls.slice(before).filter((x) => x.discoveryId === c.discoveryId);
      const passAUsage = passA.length > 0 ? { inputTokens: passA.reduce((s, x) => s + (x.inputTokens ?? 0), 0), outputTokens: passA.reduce((s, x) => s + (x.outputTokens ?? 0), 0) } : null;
      results.set(c.discoveryId, { result, rec, timedOut });
      return { result: result as CompileExecution["result"], rec, timedOut, threw, thrown, passAUsage, signal: sentinel.creditExhaustion() ?? stageSignal };
    },
    verify: async (c): Promise<VerifyExecution> => {
      const { result } = results.get(c.discoveryId)!;
      const input = inputFor(c.discoveryId);
      const snapshot = snapshotUnitsForVerification(result);
      const before = sideCalls.length; stageSignal = null;
      const v0 = Date.now();
      let verification: SemanticVerificationResult | null = null; let outcome: VerifyOutcome; let timedOut = false; let thrown: unknown;
      try { verification = await withTimeout(verifyCompiledCandidate({ compilerInput: input, compilationResult: result }, { reviewCaller: stageCaller, conditionSuspicionCaller: stageCaller }), PER_CANDIDATE_TIMEOUT_MS); outcome = "COMPLETED"; }
      catch (err) { thrown = err; timedOut = err instanceof Error && err.name === "CandidateTimeoutError"; outcome = timedOut ? "TIMEOUT" : "EXECUTION_FAILURE"; }
      const mine = sideCalls.slice(before).filter((x) => x.discoveryId === c.discoveryId);
      const usage = mine.length > 0 ? { inputTokens: mine.reduce((s, x) => s + (x.inputTokens ?? 0), 0), outputTokens: mine.reduce((s, x) => s + (x.outputTokens ?? 0), 0) } : null;
      verifications.set(c.discoveryId, { verification, snapshot });
      return { verification, outcome, timedOut, thrown, usage, sideCalls: mine.map(({ stage, inputTokens, outputTokens, costUsd }) => ({ stage, inputTokens, outputTokens, costUsd })), wallClockMs: Date.now() - v0, signal: stageSignal };
    },
    persist: (c, ce, ve, cost) => {
      const { result, rec, timedOut } = results.get(c.discoveryId)!;
      const v = verifications.get(c.discoveryId) ?? { verification: null, snapshot: snapshotUnitsForVerification(result) };
      currentCandidate = null;
      try {
        const persisted = persistCandidate({ dir: path.join(OUT, "evidence"), name: c.discoveryId, runId, compilerInput: inputFor(c.discoveryId), result, verification: v.verification, snapshot: v.snapshot, run: { model: LOCKED_MODEL, tier: 1, wallClockMs: rec.wallClockMs, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, costUsd: cost.compile.chargedToBudgetUsd, costStatus: cost.compile.costAccountingStatus, timedOut, notes: [`compile ${cost.compile.costAccountingStatus}`, `verify ${ve?.outcome ?? "NOT_RUN_COMPILE_FAILED"}`, ...(ce.passAUsage ? [`passA ${ce.passAUsage.inputTokens}/${ce.passAUsage.outputTokens} tokens billed into compile`] : [])] } });
        verifiedUnits.add(persisted.package, persisted.verifiedUnitsPath);
        return { package: { complete: persisted.package.complete, artifactsPersisted: persisted.package.counts.artifactsPersisted, unitsMissingVerification: persisted.package.counts.unitsMissingVerification, problems: [...new Set(persisted.package.problems.map((x) => x.code))].sort(), packageHash: persisted.package.packageHash, file: persisted.verifiedUnitsPath }, evidenceFile: persisted.evidencePath };
      } catch (err) {
        // a secret-leak refusal or a write failure is recorded, never swallowed, and never retried
        console.log(`  persistence refused for ${c.ref}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
    flush: (st) => { state.stop = st.stop; flush(); },
    log: (line) => console.log(line),
  });

  const stop = loop.stop!;
  const count = (f: (s: AttemptStatus) => boolean) => statuses.filter(f).length;
  save("03-run-manifest", {
    schema: "p3-conmed-resume-run-manifest.v2",
    evidenceLabel: "CURRENT_PIPELINE_COMPILE_AND_VERIFY",
    runId, model: LOCKED_MODEL, timeoutMs: PER_CANDIDATE_TIMEOUT_MS, concurrencyUsed: CONCURRENCY, autoRetry: AUTO_RETRY, fallbackModel: FALLBACK_MODEL, premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD,
    reservationPolicy,
    stopReason: stop.reason, stoppedAtCandidate: stop.candidateAtStop, stoppedAt: stop.at, stopDetail: stop.detail, creditExhaustionSignal: stop.signal,
    remainingCandidates: stop.remainingCandidates, remainingCount: stop.remainingCandidates.length,
    denominator: { dedup: p.dedupDenominator, attemptable: p.attemptable.length, skippedEmpty: p.skippedEmpty.length, skippedPriorAttempts: skippedPrior.length, toDispatch: dispatch.length },
    priorSpend: opts.priorSpend ?? null,
    attempted: statuses.length,
    compileCompleted: count((s) => s.compile.outcome === "COMPLETED"),
    compileTimeout: count((s) => s.compile.outcome === "TIMEOUT"),
    compileOtherFailure: count((s) => s.compile.outcome !== "COMPLETED" && s.compile.outcome !== "TIMEOUT"),
    verificationCompleted: count((s) => s.verify.outcome === "COMPLETED"),
    verificationIncomplete: count((s) => s.verify.outcome === "COMPLETED" && (s.verify.status === "VERIFICATION_INCOMPLETE" || s.verify.status === "NOT_VERIFIED")),
    verificationFailed: count((s) => s.verify.outcome === "TIMEOUT" || s.verify.outcome === "EXECUTION_FAILURE" || (s.verify.outcome === "COMPLETED" && s.verify.status === "VERIFICATION_FAILED")),
    verificationStatusCounts: statuses.reduce((a: Record<string, number>, s) => { const k = s.verify.status ?? s.verify.outcome; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
    pairedPackagesComplete: count((s) => s.package?.complete === true),
    pairedPackagesIncomplete: count((s) => s.package !== null && s.package.complete === false),
    pairedPackagesNotWritten: count((s) => s.package === null),
    spend: { exactUsd: ledger.exactSpendUsd, timeoutReservationsRetainedUsd: ledger.retainedUnknownUsd, outstandingReservedUsd: ledger.outstandingReservedUsd, committedUsd: ledger.committedUsd, ceilingUsd: SPEND_CEILING_USD, stopAtUsd: SPEND_STOP_AT_USD, amendmentPipelineUsd: amendmentUsd, note: opts.priorSpend ? "cumulative: includes the seeded prior spend" : "this run only" },
    candidateStatuses: statuses.map((s) => ({ discoveryId: s.discoveryId, ref: s.ref, compile: s.compile.outcome, verify: s.verify.outcome, verificationStatus: s.verify.status, packageComplete: s.package?.complete ?? null, creditExhaustion: s.creditExhaustion ? true : false })),
    verifiedUnitsManifest: "evidence/verified-units-manifest.json",
  });
  console.log(`\nDONE ${statuses.length}/${dispatch.length} stop=${stop.reason}  committed $${ledger.committedUsd.toFixed(4)} (exact $${ledger.exactSpendUsd.toFixed(4)}, retained-unknown $${ledger.retainedUnknownUsd.toFixed(4)}) of $${SPEND_CEILING_USD}`);
}

if (process.argv[1]?.endsWith("run-population-verified.ts")) void main();
