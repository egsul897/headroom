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
import { assertNotPremium, OBSERVED_INPUT_TOKENS_PER_CANDIDATE, PREMIUM_MODEL_BUDGET_USD } from "./premium-lock";
import { BudgetLedger, OBSERVED_OUTPUT_TOKENS_PER_SECOND, accountForRequest, type CostRecord } from "./timeout-policy";
import { persistCandidate, VerifiedUnitManifestWriter } from "./evidence";
import { classifyOutcome, type Outcome } from "./run-population";

export const OUT = "/tmp/claude-0/pilot/population-verified";
export const LOCKED_MODEL = "deepseek/deepseek-v4-flash";
export const FORBIDDEN_MODEL_SUFFIX = "-0731";
/** From docs/phase-3-conmed-resume/01-calibration.json: HARD_WORST_AUTHORIZED $3.29 rounded up to the next $0.25. */
export const SPEND_CEILING_USD = 3.5;
/** Ceiling minus two full (compile reservation + conservative verify) allowances, so an in-flight pair can settle under the ceiling. */
export const SPEND_STOP_AT_USD = 3.450577;
export const CONCURRENCY = 1 as const;
export const AUTO_RETRY = false as const;
export const FALLBACK_MODEL: null = null;

export type VerifyOutcome = "COMPLETED" | "TIMEOUT" | "EXECUTION_FAILURE" | "NOT_RUN_COMPILE_FAILED";

export interface AttemptStatus {
  discoveryId: string;
  ref: string;
  operativeChars: number;
  compile: { outcome: Outcome; status: string; failureReasons: string[]; wallClockMs: number | null; inputTokens: number | null; outputTokens: number | null; costUsd: number; costStatus: string };
  verify: { outcome: VerifyOutcome; status: string | null; semanticReviewInvoked: boolean | null; findings: number | null; sideCalls: { stage: string; inputTokens: number | null; outputTokens: number | null; costUsd: number }[]; costUsd: number; costStatus: string | null; wallClockMs: number | null };
  package: { complete: boolean; artifactsPersisted: number; unitsMissingVerification: number; problems: string[]; packageHash: string; file: string | null } | null;
  evidenceFile: string | null;
  committedUsd: number;
}

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

export async function main(argv: string[] = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
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
  const reservation = BudgetLedger.reservationFor(raw, PER_CANDIDATE_TIMEOUT_MS, OBSERVED_INPUT_TOKENS_PER_CANDIDATE, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
  const runId = `conmed-resume-${new Date().toISOString()}`;
  const planRecord = {
    runId, model: LOCKED_MODEL, price: { inputPerMtok: Number(raw.pricing.input) * 1e6, outputPerMtok: Number(raw.pricing.output) * 1e6 },
    timeoutMs: PER_CANDIDATE_TIMEOUT_MS, concurrency: CONCURRENCY, autoRetry: AUTO_RETRY, fallbackModel: FALLBACK_MODEL, premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD,
    ceilingUsd: SPEND_CEILING_USD, stopAtUsd: SPEND_STOP_AT_USD, reservationPerCallUsd: reservation,
    dedupDenominator: p.dedupDenominator, exactDuplicatesRemoved: p.exactDuplicatesRemoved, attemptable: p.attemptable.length, skippedEmpty: p.skippedEmpty,
    order: p.attemptable.map((c) => ({ discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), operativeChars: operativeTextFor(c, p.stages.index).length })),
  };
  save("00-plan", planRecord);
  if (dryRun) { console.log(JSON.stringify({ dryRun: true, dispatched: 0, ...planRecord, order: `${planRecord.order.length} candidates` }, null, 1)); return planRecord; }

  // one recorded caller for every non-compiler call (amendment pipeline, Gate 2, Layer 2)
  const sideCalls: { discoveryId: string | null; stage: string; model: string; inputTokens: number | null; outputTokens: number | null; costUsd: number }[] = [];
  let currentCandidate: string | null = null;
  const base = getStageCaller();
  assertNotPremium(base.model);
  const stageCaller: StageCaller = {
    providerName: base.providerName, model: base.model, isSynthetic: base.isSynthetic,
    async call<T>(schema: Parameters<StageCaller["call"]>[0], stage: string, systemPrompt: string, userContent: string): Promise<T> {
      const out = (await base.call(schema, stage, systemPrompt, userContent)) as T;
      const t = base.lastTelemetry();
      if (t) sideCalls.push({ discoveryId: currentCandidate, stage, model: t.model, inputTokens: t.inputTokens, outputTokens: t.outputTokens, costUsd: realCost(raw, t.inputTokens, t.outputTokens) });
      return out;
    },
    lastTelemetry: () => base.lastTelemetry(),
  } as StageCaller;

  const ledger = new BudgetLedger(SPEND_CEILING_USD, SPEND_STOP_AT_USD);
  const verifiedUnits = new VerifiedUnitManifestWriter(path.join(OUT, "evidence"), COMPANY_ID, INSTRUMENT_KEY, runId);
  const statuses: AttemptStatus[] = [];
  const costs: (CostRecord & { discoveryId: string; stage: "compile" | "verify" })[] = [];

  // one-time: amendment pipeline (reserved like any call)
  ledger.reserve("amendment", reservation);
  const amendment = await runAmendmentPipeline(stageCaller, { documents: p.stages.documents, packageGraph: p.stages.packageGraph, index: p.stages.index });
  const amendmentUsd = sideCalls.filter((s) => s.discoveryId === null).reduce((s, c) => s + c.costUsd, 0);
  ledger.settle("amendment", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: amendmentUsd, finalProviderBillingUnavailable: false, costAccountingStatus: "EXACT", chargedToBudgetUsd: amendmentUsd });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: p.stages.index, allEffects: amendment.effects });

  const flush = () => { save("01-statuses", statuses); save("02-costs", { snapshot: ledger.snapshot(), perRequest: costs, sideCalls }); verifiedUnits.write(); };
  let done = 0;
  for (const candidate of p.attemptable) {
    const ref = String(candidate.normalizedSourceRef);
    if (ledger.mustStop(reservation)) { console.log(`budget guard: $${ledger.committedUsd.toFixed(4)} committed; stopping before STOP_AT $${SPEND_STOP_AT_USD}`); break; }
    currentCandidate = candidate.discoveryId;
    const input = buildInput(candidate, p.bundles.get(candidate.discoveryId), p.stages, operativeState, amendment.effects);
    const operativeChars = input.operativeSourceText.length;

    // ---- compile: one attempt, reserved first ----
    ledger.reserve(`${candidate.discoveryId}:compile`, reservation);
    const t0 = Date.now();
    let result: SemanticCompilationResult;
    let rec: CandidateRecord;
    let compileTimedOut = false;
    let compileThrew = false;
    try {
      result = await withTimeout(compileCovenantToIR(input, { caller: callerFor(LOCKED_MODEL) }), PER_CANDIDATE_TIMEOUT_MS);
      rec = record(candidate, input, result, raw, 1, null);
    } catch (err) {
      compileThrew = true;
      compileTimedOut = err instanceof Error && err.name === "CandidateTimeoutError";
      result = { status: "FAILED", failureReasons: [compileTimedOut ? "WALL_CLOCK_TIMEOUT" : "TRANSPORT_OR_INTERNAL_ERROR"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult;
      rec = record(candidate, input, result, raw, 1, null);
    }
    if (rec.wallClockMs === null) rec.wallClockMs = Date.now() - t0;
    const billed = (rec.inputTokens ?? 0) + (rec.outputTokens ?? 0) > 0;
    const compileCost = accountForRequest({ model: raw, elapsedWallClockMs: rec.wallClockMs, timedOut: compileTimedOut, providerUsage: billed ? { inputTokens: rec.inputTokens ?? 0, outputTokens: rec.outputTokens ?? 0 } : null, streamedOutputTokensObserved: rec.outputTokens, reservationUsd: reservation, providerRefused: compileThrew && !compileTimedOut && !billed });
    ledger.settle(`${candidate.discoveryId}:compile`, compileCost);
    costs.push({ ...compileCost, discoveryId: candidate.discoveryId, stage: "compile" });
    const compileOutcome = classifyOutcome(rec, compileTimedOut);

    // ---- verify: only a compile that produced units is verified; snapshot BEFORE the verifier runs ----
    let verification: SemanticVerificationResult | null = null;
    let verifyOutcome: VerifyOutcome = "NOT_RUN_COMPILE_FAILED";
    let verifyCost: CostRecord | null = null;
    let verifyMs: number | null = null;
    const snapshot = snapshotUnitsForVerification(result);
    if (compileOutcome === "COMPLETED") {
      const before = sideCalls.length;
      ledger.reserve(`${candidate.discoveryId}:verify`, reservation);
      const v0 = Date.now();
      let verifyTimedOut = false;
      try {
        verification = await withTimeout(verifyCompiledCandidate({ compilerInput: input, compilationResult: result }, { reviewCaller: stageCaller, conditionSuspicionCaller: stageCaller }), PER_CANDIDATE_TIMEOUT_MS);
        verifyOutcome = "COMPLETED";
      } catch (err) {
        verifyTimedOut = err instanceof Error && err.name === "CandidateTimeoutError";
        verifyOutcome = verifyTimedOut ? "TIMEOUT" : "EXECUTION_FAILURE";
      }
      verifyMs = Date.now() - v0;
      const mine = sideCalls.slice(before);
      const usage = mine.length > 0 ? { inputTokens: mine.reduce((s, c) => s + (c.inputTokens ?? 0), 0), outputTokens: mine.reduce((s, c) => s + (c.outputTokens ?? 0), 0) } : null;
      verifyCost = accountForRequest({ model: raw, elapsedWallClockMs: verifyMs, timedOut: verifyTimedOut, providerUsage: usage, streamedOutputTokensObserved: usage?.outputTokens ?? null, reservationUsd: reservation, providerRefused: !verifyTimedOut && !usage && verifyOutcome !== "COMPLETED" });
      ledger.settle(`${candidate.discoveryId}:verify`, verifyCost);
      costs.push({ ...verifyCost, discoveryId: candidate.discoveryId, stage: "verify" });
    }

    // ---- persist: evidence + paired package from the same objects, whatever happened ----
    let persisted: ReturnType<typeof persistCandidate> | null = null;
    try {
      persisted = persistCandidate({ dir: path.join(OUT, "evidence"), name: candidate.discoveryId, runId, compilerInput: input, result, verification, snapshot, run: { model: LOCKED_MODEL, tier: 1, wallClockMs: rec.wallClockMs, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, costUsd: compileCost.chargedToBudgetUsd, costStatus: compileCost.costAccountingStatus, timedOut: compileTimedOut, notes: [`compile ${compileOutcome}`, `verify ${verifyOutcome}`] } });
      verifiedUnits.add(persisted.package, persisted.verifiedUnitsPath);
    } catch (err) {
      // a secret-leak refusal or a write failure is recorded, never swallowed, and never retried
      console.log(`  persistence refused for ${ref}: ${err instanceof Error ? err.message : String(err)}`);
    }

    statuses.push({
      discoveryId: candidate.discoveryId, ref, operativeChars,
      compile: { outcome: compileOutcome, status: rec.status, failureReasons: rec.failureReasons, wallClockMs: rec.wallClockMs, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, costUsd: compileCost.chargedToBudgetUsd, costStatus: compileCost.costAccountingStatus },
      verify: { outcome: verifyOutcome, status: verification?.status ?? null, semanticReviewInvoked: verification?.semanticReviewInvoked ?? null, findings: verification?.findings.length ?? null, sideCalls: sideCalls.filter((s) => s.discoveryId === candidate.discoveryId).map(({ stage, inputTokens, outputTokens, costUsd }) => ({ stage, inputTokens, outputTokens, costUsd })), costUsd: verifyCost?.chargedToBudgetUsd ?? 0, costStatus: verifyCost?.costAccountingStatus ?? null, wallClockMs: verifyMs },
      package: persisted ? { complete: persisted.package.complete, artifactsPersisted: persisted.package.counts.artifactsPersisted, unitsMissingVerification: persisted.package.counts.unitsMissingVerification, problems: [...new Set(persisted.package.problems.map((x) => x.code))].sort(), packageHash: persisted.package.packageHash, file: persisted.verifiedUnitsPath } : null,
      evidenceFile: persisted?.evidencePath ?? null,
      committedUsd: ledger.committedUsd,
    });
    currentCandidate = null;
    console.log(`  [${++done}/${p.attemptable.length}] ${ref.padEnd(14)} compile=${compileOutcome.padEnd(18)} verify=${verifyOutcome.padEnd(22)} pkg=${persisted ? (persisted.package.complete ? "complete" : "incomplete") : "NOT_WRITTEN"} committed=$${ledger.committedUsd.toFixed(4)}`);
    if (done % 10 === 0) flush();
  }

  flush();
  const count = (f: (s: AttemptStatus) => boolean) => statuses.filter(f).length;
  save("03-run-manifest", {
    schema: "p3-conmed-resume-run-manifest.v1",
    evidenceLabel: "CURRENT_PIPELINE_COMPILE_AND_VERIFY",
    runId, model: LOCKED_MODEL, timeoutMs: PER_CANDIDATE_TIMEOUT_MS, concurrencyUsed: CONCURRENCY, autoRetry: AUTO_RETRY, fallbackModel: FALLBACK_MODEL, premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD,
    denominator: { dedup: p.dedupDenominator, attemptable: p.attemptable.length, skippedEmpty: p.skippedEmpty.length },
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
    spend: { exactUsd: ledger.exactSpendUsd, timeoutReservationsRetainedUsd: ledger.retainedUnknownUsd, committedUsd: ledger.committedUsd, ceilingUsd: SPEND_CEILING_USD, stopAtUsd: SPEND_STOP_AT_USD, amendmentPipelineUsd: amendmentUsd },
    candidateStatuses: statuses.map((s) => ({ discoveryId: s.discoveryId, ref: s.ref, compile: s.compile.outcome, verify: s.verify.outcome, verificationStatus: s.verify.status, packageComplete: s.package?.complete ?? null })),
    verifiedUnitsManifest: "evidence/verified-units-manifest.json",
  });
  console.log(`\nDONE ${statuses.length}/${p.attemptable.length}  committed $${ledger.committedUsd.toFixed(4)} (exact $${ledger.exactSpendUsd.toFixed(4)}, retained-unknown $${ledger.retainedUnknownUsd.toFixed(4)}) of $${SPEND_CEILING_USD}`);
}

if (process.argv[1]?.endsWith("run-population-verified.ts")) void main();
