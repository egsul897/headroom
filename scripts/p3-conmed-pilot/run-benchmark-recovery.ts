/**
 * CONMED BENCHMARK RECOVERY - a supplementary, separately labelled run over the eight V3.1.1
 * benchmark cases that were EXECUTION_LIMITED in the immutable one-shot population.
 *
 * Question answered: can the current compiler/verifier produce semantic evidence for these
 * provisions when given a bounded second opportunity? (The population already measured one-shot
 * reliability; nothing here alters it.)
 *
 *   - exactly eight targets (7.11 excluded: it already has complete current-pipeline evidence);
 *     any non-target dispatch is refused before the request begins;
 *   - locked model, unchanged compiler, verifier, prompts, context, limits and 480 s timeout;
 *     concurrency 1; no fallback, no premium, no automatic retry inside an attempt;
 *   - a fresh recovery ledger: HARD_CEILING $15.00, STOP_AT $14.90, P-7 shape-derived
 *     reservations, the hard invariant before every dispatch, P-6 credit-exhaustion stop;
 *   - Pass 1: one attempt per target in deterministic plan order; Pass 2: at most one more attempt
 *     per target whose first failure was execution-related, in benchmark-value priority order,
 *     budget permitting (NOT_RETRIED_BUDGET otherwise). Never a third attempt;
 *   - every attempt persisted distinctly (evidence/attempt-N/...), never overwritten;
 *   - canonical evidence per case = the FIRST complete recovered attempt (never the semantically
 *     more favourable one); both attempts kept for variance analysis.
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
import { parseVerifiedUnitPackage, snapshotUnitsForVerification } from "../../lib/contract-model/verified-units";
import { COMPANY_ID, INSTRUMENT_KEY, operativeTextFor } from "./pipeline";
import { PER_CANDIDATE_TIMEOUT_MS, buildInput, callerFor, loadModel, maxTokensFor, realCost, record, withTimeout, type CandidateRecord } from "./compile-run";
import { assertNotPremium, PREMIUM_MODEL_BUDGET_USD } from "./premium-lock";
import { BudgetLedger, accountForRequest, type CostRecord } from "./timeout-policy";
import { persistCandidate, VerifiedUnitManifestWriter } from "./evidence";
import { detectCreditExhaustionInError, GatewayResponseSentinel, type CreditExhaustionSignal } from "./gateway-credit";
import { compileReservationUsd, compileShape, MAX_FIRST_TURN_INPUT_TOKENS_REEXPORT, outputTokensCap, verifyReservationUsd, verifyShape, candidateMaxReservationUsd } from "./reservation-policy";
import { runCandidateLoop, type AttemptStatus, type CompileExecution, type LoopCandidate, type LoopState, type VerifyExecution, type VerifyOutcome } from "./population-loop";
import { plan, LOCKED_MODEL, FORBIDDEN_MODEL_SUFFIX, CONCURRENCY, AUTO_RETRY, FALLBACK_MODEL } from "./run-population-verified";

export const EVIDENCE_LABEL = "BENCHMARK_RECOVERY" as const;
export const TARGET_REFS = ["7.1", "7.2", "7.10", "7.2(c)", "7.13", "7.14", "7.16", "7.17"] as const;
export const EXCLUDED_REF = "7.11";
export const TARGET_COUNT = 8;
export const RECOVERY_CEILING_USD = 15.0;
export const RECOVERY_STOP_AT_USD = 14.9;
export const MAX_ATTEMPTS_PER_CASE = 2;
export const OUT = process.env.CONMED_RECOVERY_OUT ?? "/tmp/claude-0/pilot/benchmark-recovery";

export type RecoveryOutcome = "RECOVERED" | "TIMEOUT" | "SCHEMA_FAILURE" | "PROVIDER_FAILURE" | "OTHER_EXECUTION_FAILURE" | "VERIFICATION_FAILURE" | "PERSISTENCE_INCOMPLETE" | "CREDIT_EXHAUSTED";

export interface RecoveryAttempt extends AttemptStatus { attempt: 1 | 2; pass: 1 | 2; recovery: RecoveryOutcome; retryEligible: boolean; retryIneligibleReason: string | null; p1Occurrence: boolean; packageHashValid: boolean | null }

/**
 * §12 RECOVERED: compile completed, the verifier returned a result (any status, including
 * VERIFICATION_FAILED), evidence persisted, paired package exists, complete, hashes re-validate.
 */
export function classifyRecovery(s: AttemptStatus): { recovery: RecoveryOutcome; packageHashValid: boolean | null; p1Occurrence: boolean } {
  const p1Occurrence = (s.package?.problems ?? []).includes("VERIFICATION_WITHOUT_IR");
  if (s.creditExhaustion) return { recovery: "CREDIT_EXHAUSTED", packageHashValid: null, p1Occurrence };
  if (s.compile.outcome === "TIMEOUT") return { recovery: "TIMEOUT", packageHashValid: null, p1Occurrence };
  if (s.compile.outcome === "SCHEMA_FAILURE") return { recovery: "SCHEMA_FAILURE", packageHashValid: null, p1Occurrence };
  if (s.compile.outcome === "PROVIDER_FAILURE") return { recovery: "PROVIDER_FAILURE", packageHashValid: null, p1Occurrence };
  if (s.compile.outcome !== "COMPLETED") return { recovery: "OTHER_EXECUTION_FAILURE", packageHashValid: null, p1Occurrence };
  if (s.verify.outcome !== "COMPLETED") return { recovery: "VERIFICATION_FAILURE", packageHashValid: null, p1Occurrence };
  let packageHashValid: boolean | null = null;
  if (s.package?.file && fs.existsSync(s.package.file)) { try { packageHashValid = parseVerifiedUnitPackage(fs.readFileSync(s.package.file, "utf8")).packageHash === s.package.packageHash; } catch { packageHashValid = false; } }
  const recovered = !!s.evidenceFile && fs.existsSync(s.evidenceFile) && !!s.package && s.package.complete === true && packageHashValid === true;
  return { recovery: recovered ? "RECOVERED" : "PERSISTENCE_INCOMPLETE", packageHashValid, p1Occurrence };
}

/** §13: only an execution-related first failure earns the bounded second attempt. */
export function retryEligibility(a: { recovery: RecoveryOutcome; p1Occurrence: boolean; evidenceFile: string | null; package: AttemptStatus["package"] }): { eligible: boolean; reason: string | null } {
  switch (a.recovery) {
    case "RECOVERED": return { eligible: false, reason: "recovered - no retry regardless of verification status" };
    case "CREDIT_EXHAUSTED": return { eligible: false, reason: "gateway credit exhausted - the run stops" };
    case "TIMEOUT": case "SCHEMA_FAILURE": case "PROVIDER_FAILURE": case "OTHER_EXECUTION_FAILURE": case "VERIFICATION_FAILURE": return { eligible: true, reason: null };
    case "PERSISTENCE_INCOMPLETE":
      if (a.p1Occurrence) return { eligible: false, reason: "package incomplete by P-1 (verifier finding bound to no compiled unit) - a verifier-output property, not an execution failure; not recovered for scoring" };
      if (!a.evidenceFile) return { eligible: true, reason: null };
      return { eligible: false, reason: `package incomplete (${(a.package?.problems ?? []).join(",") || "no units"}) after a completed compile+verify - not an execution failure` };
  }
}

export const bandOf = (n: number) => (n <= 776 ? "SHORT" : n < 1886 ? "MID" : "LONG");
const BAND_RANK = { SHORT: 0, MID: 1, LONG: 2 } as const;

/** §14 priority: no semantic evidence at all first, then shorter/mid before long parents. */
export function pass2Order<T extends { ref: string; operativeChars: number; anyUnits: boolean }>(eligible: T[]): T[] {
  return [...eligible].sort((a, b) => (Number(a.anyUnits) - Number(b.anyUnits)) || (BAND_RANK[bandOf(a.operativeChars)] - BAND_RANK[bandOf(b.operativeChars)]) || (a.operativeChars - b.operativeChars) || (a.ref < b.ref ? -1 : 1));
}

/** §21: the FIRST complete recovered attempt, never the semantically more favourable one. */
export function canonicalAttempt(attempts: RecoveryAttempt[]): RecoveryAttempt | null {
  return [...attempts].sort((a, b) => a.attempt - b.attempt).find((a) => a.recovery === "RECOVERED") ?? null;
}

export interface VarianceRow { ref: string; attempts: { attempt: number; rules: number; definitions: number; verifyStatus: string | null; materialFindings: number; findings: number; packageHash: string | null; artifactHashes: string[]; outputHash: string | null }[]; structurallyIdentical: boolean | null }
/** §22: structural comparison of two completed attempts - counts and hashes only, no scoring. */
export function varianceReport(attemptsByRef: Map<string, RecoveryAttempt[]>): VarianceRow[] {
  const rows: VarianceRow[] = [];
  for (const [ref, attempts] of attemptsByRef) {
    const completed = attempts.filter((a) => a.compile.outcome === "COMPLETED" && a.evidenceFile && fs.existsSync(a.evidenceFile));
    if (completed.length < 2) continue;
    const details = completed.sort((a, b) => a.attempt - b.attempt).map((a) => {
      const ev = JSON.parse(fs.readFileSync(a.evidenceFile!, "utf8"));
      const findings = (ev.verification?.findings ?? []) as { severity: string }[];
      let artifactHashes: string[] = [];
      if (a.package?.file && fs.existsSync(a.package.file)) { try { artifactHashes = parseVerifiedUnitPackage(fs.readFileSync(a.package.file, "utf8")).units.map((u) => u.artifactHash).sort(); } catch { artifactHashes = []; } }
      return { attempt: a.attempt, rules: (ev.compilation.rules ?? []).length, definitions: (ev.compilation.definitions ?? []).length, verifyStatus: ev.verification?.status ?? null, materialFindings: findings.filter((f) => f.severity === "MATERIAL").length, findings: findings.length, packageHash: a.package?.packageHash ?? null, artifactHashes, outputHash: ev.compilation.outputHash ?? null };
    });
    const [x, y] = details;
    rows.push({ ref, attempts: details, structurallyIdentical: x && y ? x.outputHash !== null && x.outputHash === y.outputHash && JSON.stringify(x.artifactHashes) === JSON.stringify(y.artifactHashes) : null });
  }
  return rows;
}

export const RECOVERY_DOCS_DIR = "docs/phase-3-conmed-benchmark-recovery";

export interface ResumeState {
  segmentDir: string;
  priorAttempts: RecoveryAttempt[];
  inFlightAborted: { ref: string; discoveryId: string; operativeChars: number; chargedUsd: number } | null;
  accountingCorrections: { ref: string; attempt: number; was: { costUsd: number; costStatus: string }; now: { costUsd: number; costStatus: string }; why: string }[];
  seededPrior: { exactUsd: number; retainedUnknownUsd: number; breakdown: Record<string, number> };
  preflight: { ok: boolean; spendUsd: number; model: string; creditExhaustion: boolean };
}

/**
 * Resume after a harness abort: every attempt the earlier segment recorded is carried forward
 * (never re-run), a candidate that was in flight when the segment died has its attempt CONSUMED
 * (HARNESS_ABORTED_IN_FLIGHT: unknown billing, one full compile reservation charged, retry-eligible
 * as an execution failure), and any timeout the earlier loop settled from partial usage is
 * re-accounted at the full reservation (the harness defect that forced the abort). The seeded prior
 * spend carries the probes, the segment's amendment call and every corrected charge into the new
 * ledger so the same $15 ceiling governs both segments. Evidence paths point at the PRESERVED copy.
 */
export function deriveResumeState(segmentDir: string, model: ReturnType<typeof loadModel>, targets: LoopCandidate[]): ResumeState {
  const rd = (n: string) => JSON.parse(fs.readFileSync(path.join(segmentDir, n), "utf8"));
  const sPlan = rd("00-plan.json"); const sAttempts = rd("01-attempts.json") as RecoveryAttempt[]; const sCosts = rd("02-costs.json") as { sideCalls: { discoveryId: string | null; costUsd: number }[] }; const preflight = rd("preflight-health.json");
  if (JSON.stringify((sPlan.targets as { discoveryId: string }[]).map((t) => t.discoveryId)) !== JSON.stringify(targets.map((t) => t.discoveryId))) throw new Error("resume: the earlier segment planned different targets");
  if (fs.existsSync(path.join(segmentDir, "03-run-manifest.json"))) throw new Error("resume: the earlier segment terminated normally; nothing to resume");
  const scratchPrefix = sPlan.scratchDir ?? "/tmp/claude-0/pilot/benchmark-recovery";
  const relocate = (f: string | null) => (f ? f.replace(scratchPrefix, segmentDir) : f);
  const accountingCorrections: ResumeState["accountingCorrections"] = [];
  let exact = preflight.spendUsd as number; let retained = 0;
  const breakdown: Record<string, number> = { preflightProbesUsd: preflight.spendUsd, segmentAmendmentUsd: sCosts.sideCalls.filter((c) => c.discoveryId === null).reduce((s, c) => s + c.costUsd, 0) };
  exact += breakdown.segmentAmendmentUsd!;
  const priorAttempts = sAttempts.map((a) => {
    const row: RecoveryAttempt = { ...a, evidenceFile: relocate(a.evidenceFile), package: a.package ? { ...a.package, file: relocate(a.package.file) } : null };
    if (a.compile.outcome === "TIMEOUT" && a.compile.costStatus !== "UNKNOWN_TIMEOUT_BILLED") {
      const reservation = a.compile.reservationUsd ?? compileReservationUsd(model, a.operativeChars, PER_CANDIDATE_TIMEOUT_MS);
      accountingCorrections.push({ ref: a.ref, attempt: a.attempt, was: { costUsd: a.compile.costUsd, costStatus: a.compile.costStatus }, now: { costUsd: reservation, costStatus: "UNKNOWN_TIMEOUT_BILLED" }, why: "the earlier loop settled a timed-out compile from the Pass A usage observed before the cut-off; a timeout's billing is unknown and the full reservation is retained (population-loop.ts fix)" });
      row.compile = { ...a.compile, costUsd: reservation, costStatus: "UNKNOWN_TIMEOUT_BILLED" };
    }
    if (row.compile.costStatus === "UNKNOWN_TIMEOUT_BILLED") retained += row.compile.costUsd; else exact += row.compile.costUsd;
    if (row.verify.costStatus === "UNKNOWN_TIMEOUT_BILLED") retained += row.verify.costUsd; else exact += row.verify.costUsd;
    return row;
  });
  breakdown.segmentAttemptsExactUsd = priorAttempts.reduce((s, a) => s + (a.compile.costStatus === "UNKNOWN_TIMEOUT_BILLED" ? 0 : a.compile.costUsd) + (a.verify.costStatus === "UNKNOWN_TIMEOUT_BILLED" ? 0 : a.verify.costUsd), 0);
  breakdown.segmentAttemptsRetainedUsd = priorAttempts.reduce((s, a) => s + (a.compile.costStatus === "UNKNOWN_TIMEOUT_BILLED" ? a.compile.costUsd : 0) + (a.verify.costStatus === "UNKNOWN_TIMEOUT_BILLED" ? a.verify.costUsd : 0), 0);
  // the candidate in flight when the segment died: first target in plan order without an attempt row
  const attempted = new Set(priorAttempts.map((a) => a.discoveryId));
  const f = targets.find((t) => !attempted.has(t.discoveryId));
  let inFlightAborted: ResumeState["inFlightAborted"] = null;
  if (f) {
    const chargedUsd = compileReservationUsd(model, f.operativeChars, PER_CANDIDATE_TIMEOUT_MS);
    inFlightAborted = { ref: f.ref, discoveryId: f.discoveryId, operativeChars: f.operativeChars, chargedUsd };
    priorAttempts.push({ discoveryId: f.discoveryId, ref: f.ref, operativeChars: f.operativeChars, attempt: 1, pass: 1, recovery: "OTHER_EXECUTION_FAILURE", retryEligible: true, retryIneligibleReason: null, p1Occurrence: false, packageHashValid: null,
      compile: { outcome: "OTHER_EXECUTION_FAILURE", status: "FAILED", failureReasons: ["HARNESS_ABORTED_IN_FLIGHT"], wallClockMs: null, inputTokens: null, outputTokens: null, costUsd: chargedUsd, costStatus: "UNKNOWN_TIMEOUT_BILLED", passAUsage: null, reservationUsd: chargedUsd },
      verify: { outcome: "NOT_RUN_COMPILE_FAILED", status: null, semanticReviewInvoked: null, findings: null, sideCalls: [], costUsd: 0, costStatus: null, wallClockMs: null },
      package: null, evidenceFile: null, committedUsd: 0 });
    retained += chargedUsd; breakdown.inFlightAbortedReservationUsd = chargedUsd;
  }
  return { segmentDir, priorAttempts, inFlightAborted, accountingCorrections, seededPrior: { exactUsd: Number(exact.toFixed(8)), retainedUnknownUsd: Number(retained.toFixed(8)), breakdown }, preflight: { ok: preflight.ok, spendUsd: preflight.spendUsd, model: preflight.model, creditExhaustion: preflight.creditExhaustion } };
}

function save(name: string, body: unknown) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 2)); }

export async function main(argv: string[] = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  const resumeFrom = argv.includes("--resume-from") ? argv[argv.indexOf("--resume-from") + 1] ?? null : null;
  if (dryRun) { delete process.env.AI_GATEWAY_API_KEY; delete process.env.ANTHROPIC_API_KEY; }
  else {
    if (process.env.CONMED_RECOVERY_AUTHORIZED !== "1") throw new Error("this runner is prepared but not authorized: set CONMED_RECOVERY_AUTHORIZED=1 in a mission that explicitly authorizes the benchmark recovery and its $15 ceiling");
    if (!process.env.AI_GATEWAY_API_KEY) throw new Error("no gateway credential present");
  }
  if (LOCKED_MODEL !== "deepseek/deepseek-v4-flash" || LOCKED_MODEL.endsWith(FORBIDDEN_MODEL_SUFFIX)) throw new Error("model lock violated");
  if (PREMIUM_MODEL_BUDGET_USD !== 0 || AUTO_RETRY !== false || FALLBACK_MODEL !== null || CONCURRENCY !== 1) throw new Error("execution policy violated");
  process.env.ANALYZER_MODEL = LOCKED_MODEL;
  assertNotPremium(process.env.ANALYZER_MODEL);
  const raw = loadModel(LOCKED_MODEL);
  if (raw.id !== LOCKED_MODEL) throw new Error(`catalogue returned ${raw.id} for ${LOCKED_MODEL}`);
  assertNotPremium(raw.id, raw.pricing);
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(raw));

  // ---- targets: exactly eight, resolved from the sealed population, 7.11 excluded ----
  const p = await plan();
  const byRef = new Map(p.attemptable.map((c) => [String(c.normalizedSourceRef), c]));
  const targets = TARGET_REFS.map((ref) => { const c = byRef.get(ref); if (!c) throw new Error(`target ${ref} not in the attemptable population`); return c; });
  if (targets.length !== TARGET_COUNT || new Set(targets.map((t) => t.discoveryId)).size !== TARGET_COUNT) throw new Error("TARGET_COUNT != 8");
  if ((TARGET_REFS as readonly string[]).includes(EXCLUDED_REF)) throw new Error("7.11 must not be a target");
  const targetIds = new Set(targets.map((t) => t.discoveryId));
  const loopCandidates: LoopCandidate[] = targets.map((c) => ({ discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), operativeChars: operativeTextFor(c, p.stages.index).length }))
    .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)); // deterministic plan order (same ordering as the population plan)
  const maxChars = Math.max(...loopCandidates.map((c) => c.operativeChars));
  const stageCallReservation = Number((MAX_FIRST_TURN_INPUT_TOKENS_REEXPORT * Number(raw.pricing.input) + outputTokensCap(raw, PER_CANDIDATE_TIMEOUT_MS) * Number(raw.pricing.output)).toFixed(8));
  const reservationPolicy = { policy: "reservation-policy.v1 (execution-shape derived; P-7), unchanged", compileReservationUsdAtMaxChars: compileReservationUsd(raw, maxChars, PER_CANDIDATE_TIMEOUT_MS), verifyReservationUsd: verifyReservationUsd(raw, PER_CANDIDATE_TIMEOUT_MS), candidateMaxReservationUsd: candidateMaxReservationUsd(raw, maxChars, PER_CANDIDATE_TIMEOUT_MS), stageCallReservationUsd: stageCallReservation, compileShapeAtMaxChars: compileShape(raw, maxChars, PER_CANDIDATE_TIMEOUT_MS), verifyShape: verifyShape(raw, PER_CANDIDATE_TIMEOUT_MS) };
  const runId = `conmed-benchmark-recovery-${new Date().toISOString()}`;
  const resume = resumeFrom ? deriveResumeState(resumeFrom, raw, loopCandidates) : null;
  const preflightPath = path.join(OUT, "preflight-health.json");
  const preflight = resume ? resume.preflight : fs.existsSync(preflightPath) ? JSON.parse(fs.readFileSync(preflightPath, "utf8")) : null;
  const priorIds = new Set((resume?.priorAttempts ?? []).map((a) => a.discoveryId));
  const pass1Candidates = loopCandidates.filter((c) => !priorIds.has(c.discoveryId));
  const planRecord = {
    runId, evidenceLabel: EVIDENCE_LABEL, model: LOCKED_MODEL, price: { inputPerMtok: Number(raw.pricing.input) * 1e6, outputPerMtok: Number(raw.pricing.output) * 1e6 },
    timeoutMs: PER_CANDIDATE_TIMEOUT_MS, concurrency: CONCURRENCY, autoRetry: AUTO_RETRY, fallbackModel: FALLBACK_MODEL, premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD,
    ceilingUsd: RECOVERY_CEILING_USD, stopAtUsd: RECOVERY_STOP_AT_USD, maxAttemptsPerCase: MAX_ATTEMPTS_PER_CASE, reservationPolicy,
    targetCount: loopCandidates.length, excluded: { ref: EXCLUDED_REF, reason: "already has complete current-pipeline evidence" }, scratchDir: OUT,
    resume: resume ? { segmentDir: resume.segmentDir, priorAttempts: resume.priorAttempts.map((a) => ({ ref: a.ref, attempt: a.attempt, recovery: a.recovery, compile: a.compile.outcome, costUsd: a.compile.costUsd, costStatus: a.compile.costStatus })), inFlightAborted: resume.inFlightAborted, accountingCorrections: resume.accountingCorrections, seededPrior: resume.seededPrior, pass1Remaining: pass1Candidates.map((c) => c.ref) } : null,
    targets: loopCandidates.map((c) => ({ ...c, band: bandOf(c.operativeChars), populationOutcome: "TIMEOUT (EXECUTION_LIMITED)" })),
    preflight: preflight ? { ok: preflight.ok, spendUsd: preflight.spendUsd, model: preflight.model } : null,
  };
  save("00-plan", planRecord);
  if (dryRun) { console.log(JSON.stringify({ dryRun: true, dispatched: 0, ...planRecord }, null, 1)); return planRecord; }
  if (!preflight || !preflight.ok || preflight.model !== LOCKED_MODEL || preflight.creditExhaustion) throw new Error("pre-flight health probes missing or failed - refusing to dispatch");

  // ---- one recorded caller for every non-compiler call (amendment, Pass A, verifier); P-6 sentinel on the compiler client ----
  const sideCalls: { discoveryId: string | null; stage: string; model: string; inputTokens: number | null; outputTokens: number | null; costUsd: number }[] = [];
  let currentCandidate: string | null = null;
  let stageSignal: CreditExhaustionSignal | null = null;
  const sentinel = new GatewayResponseSentinel();
  const base = getStageCaller();
  assertNotPremium(base.model);
  if (base.model !== LOCKED_MODEL) throw new Error(`stage caller model ${base.model} != locked model`);
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

  // ---- recovery ledger: begins at zero; the two health probes are its first exact entries ----
  const ledger = new BudgetLedger(RECOVERY_CEILING_USD, RECOVERY_STOP_AT_USD);
  if (resume) {
    // the probes, the earlier segment's amendment call and every (corrected) attempt charge, through the same reserve/settle path
    ledger.reserve("prior:exact", resume.seededPrior.exactUsd);
    ledger.settle("prior:exact", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: resume.seededPrior.exactUsd, finalProviderBillingUnavailable: false, costAccountingStatus: "EXACT", chargedToBudgetUsd: resume.seededPrior.exactUsd });
    ledger.reserve("prior:retained", resume.seededPrior.retainedUnknownUsd);
    ledger.settle("prior:retained", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: 0, finalProviderBillingUnavailable: true, costAccountingStatus: "UNKNOWN_TIMEOUT_BILLED", chargedToBudgetUsd: resume.seededPrior.retainedUnknownUsd });
  } else {
    ledger.reserve("preflight", preflight.spendUsd);
    ledger.settle("preflight", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: preflight.spendUsd, finalProviderBillingUnavailable: false, costAccountingStatus: "EXACT", chargedToBudgetUsd: preflight.spendUsd });
  }
  const amendmentDecision = ledger.reserveOrRefuse("amendment", stageCallReservation);
  if (!amendmentDecision.allowed) throw new Error(`budget invariant refused the amendment call before dispatch: ${JSON.stringify(amendmentDecision)}`);
  const amendment = await runAmendmentPipeline(stageCaller, { documents: p.stages.documents, packageGraph: p.stages.packageGraph, index: p.stages.index });
  const amendmentUsd = sideCalls.filter((s) => s.discoveryId === null).reduce((s, c) => s + c.costUsd, 0);
  ledger.settle("amendment", { model: raw.id, elapsedWallClockMs: 0, streamedOutputTokensObserved: null, providerUsageObserved: null, locallyCalculatedCostUsd: amendmentUsd, finalProviderBillingUnavailable: false, costAccountingStatus: "EXACT", chargedToBudgetUsd: amendmentUsd });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: p.stages.index, allEffects: amendment.effects });

  const attempts: RecoveryAttempt[] = [...(resume?.priorAttempts ?? [])];
  const costs: (CostRecord & { discoveryId: string; stage: "compile" | "verify"; attempt: number })[] = [];
  const passStops: Record<string, LoopState["stop"]> = {};
  const byId = new Map(loopCandidates.map((c) => [c.discoveryId, c]));
  const inputs = new Map<string, ReturnType<typeof buildInput>>();
  const inputFor = (id: string) => { let input = inputs.get(id); if (!input) { const c = targets.find((t) => t.discoveryId === id)!; input = buildInput(c, p.bundles.get(id), p.stages, operativeState, amendment.effects); inputs.set(id, input); } return input; };
  const flush = () => { save("01-attempts", attempts); save("02-costs", { snapshot: ledger.snapshot(), perRequest: costs, sideCalls }); save("03-run-manifest.checkpoint", { runId, attempts: attempts.length, committedUsd: ledger.committedUsd, passStops }); };

  const runPass = async (passNo: 1 | 2, candidates: LoopCandidate[]) => {
    const attemptDir = path.join(OUT, "evidence", `attempt-${passNo}`);
    const verifiedUnits = new VerifiedUnitManifestWriter(attemptDir, COMPANY_ID, INSTRUMENT_KEY, `${runId}:attempt-${passNo}`);
    const results = new Map<string, { result: SemanticCompilationResult; rec: CandidateRecord; timedOut: boolean }>();
    const verifications = new Map<string, { verification: SemanticVerificationResult | null; snapshot: ReturnType<typeof snapshotUnitsForVerification> }>();
    const passAttempts: AttemptStatus[] = [];
    const state = await runCandidateLoop({
      candidates, ledger, model: raw,
      compileShape: (c) => compileShape(raw, c.operativeChars, PER_CANDIDATE_TIMEOUT_MS),
      verifyShape: () => verifyShape(raw, PER_CANDIDATE_TIMEOUT_MS),
      compileReservationUsd: (c) => compileReservationUsd(raw, c.operativeChars, PER_CANDIDATE_TIMEOUT_MS),
      verifyReservationUsd: () => verifyReservationUsd(raw, PER_CANDIDATE_TIMEOUT_MS),
      compile: async (c): Promise<CompileExecution> => {
        if (!targetIds.has(c.discoveryId)) throw new Error(`refusing to dispatch non-target candidate ${c.discoveryId}`);
        if (attempts.filter((a) => a.discoveryId === c.discoveryId).length >= MAX_ATTEMPTS_PER_CASE) throw new Error(`refusing a third attempt for ${c.ref}`);
        const candidate = targets.find((t) => t.discoveryId === c.discoveryId)!;
        currentCandidate = c.discoveryId; stageSignal = null; sentinel.reset();
        const input = inputFor(c.discoveryId);
        const before = sideCalls.length;
        const t0 = Date.now();
        let result: SemanticCompilationResult; let rec: CandidateRecord; let timedOut = false; let threw = false; let thrown: unknown;
        try {
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
          const persisted = persistCandidate({ dir: attemptDir, name: c.discoveryId, runId: `${runId}:attempt-${passNo}`, compilerInput: inputFor(c.discoveryId), result, verification: v.verification, snapshot: v.snapshot, run: { model: LOCKED_MODEL, tier: 1, wallClockMs: rec.wallClockMs, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, costUsd: cost.compile.chargedToBudgetUsd, costStatus: cost.compile.costAccountingStatus, timedOut, notes: [EVIDENCE_LABEL, `attempt ${passNo}`, `compile ${cost.compile.costAccountingStatus}`, `verify ${ve?.outcome ?? "NOT_RUN_COMPILE_FAILED"}`, ...(ce.passAUsage ? [`passA ${ce.passAUsage.inputTokens}/${ce.passAUsage.outputTokens} tokens billed into compile`] : [])] } });
          verifiedUnits.add(persisted.package, persisted.verifiedUnitsPath);
          return { package: { complete: persisted.package.complete, artifactsPersisted: persisted.package.counts.artifactsPersisted, unitsMissingVerification: persisted.package.counts.unitsMissingVerification, problems: [...new Set(persisted.package.problems.map((x) => x.code))].sort(), packageHash: persisted.package.packageHash, file: persisted.verifiedUnitsPath }, evidenceFile: persisted.evidencePath };
        } catch (err) { console.log(`  persistence refused for ${c.ref}: ${err instanceof Error ? err.message : String(err)}`); return null; }
      },
      flush: (st) => {
        // fold this pass's rows into the run-wide attempt list, classified, and flush everything
        for (const s of st.statuses.slice(passAttempts.length)) {
          passAttempts.push(s);
          const cls = classifyRecovery(s);
          const el = retryEligibility({ ...cls, evidenceFile: s.evidenceFile, package: s.package });
          attempts.push({ ...s, attempt: passNo, pass: passNo, recovery: cls.recovery, packageHashValid: cls.packageHashValid, p1Occurrence: cls.p1Occurrence, retryEligible: passNo === 1 ? el.eligible : false, retryIneligibleReason: passNo === 1 ? el.reason : "no third attempt" });
        }
        for (const c of st.costs.slice(costs.filter((x) => x.attempt === passNo).length)) costs.push({ ...c, attempt: passNo });
        passStops[`pass${passNo}`] = st.stop;
        verifiedUnits.write();
        flush();
      },
      log: (line) => console.log(`[pass ${passNo}] ${line}`),
    });
    return state;
  };

  // ---- Pass 1: every target once, plan order ----
  console.log(`PASS 1${resume ? ` (resumed; ${attempts.length} prior attempt(s) carried)` : ""}: ${pass1Candidates.map((c) => c.ref).join(", ")}`);
  const pass1 = pass1Candidates.length > 0 ? await runPass(1, pass1Candidates) : { statuses: [], costs: [], stop: { reason: "COMPLETED" as const, candidateAtStop: null, at: new Date().toISOString(), committedUsd: ledger.committedUsd, remainingCandidates: [], detail: "nothing left to dispatch in pass 1", signal: null } };
  // ---- Pass 2: bounded retry for execution-related failures, priority order, budget permitting ----
  const notRecovered = attempts.filter((a) => a.pass === 1 && a.recovery !== "RECOVERED");
  const eligible = notRecovered.filter((a) => a.retryEligible);
  const ordered = pass2Order(eligible.map((a) => ({ ref: a.ref, discoveryId: a.discoveryId, operativeChars: a.operativeChars, anyUnits: (a.package?.artifactsPersisted ?? 0) > 0 })));
  const pass2Plan = { notRecovered: notRecovered.map((a) => a.ref), eligible: eligible.map((a) => a.ref), ineligible: notRecovered.filter((a) => !a.retryEligible).map((a) => ({ ref: a.ref, reason: a.retryIneligibleReason })), order: ordered.map((o) => o.ref), skippedBecausePass1Stopped: pass1.stop!.reason !== "COMPLETED" ? pass1.stop!.reason : null };
  save("02-pass2-plan", pass2Plan);
  let pass2: LoopState | null = null;
  if (pass1.stop!.reason === "COMPLETED" && ordered.length > 0) {
    console.log(`PASS 2 (priority order): ${ordered.map((o) => o.ref).join(", ")}`);
    pass2 = await runPass(2, ordered.map((o) => ({ discoveryId: o.discoveryId, ref: o.ref, operativeChars: o.operativeChars })));
  }
  const attempted2 = new Set(attempts.filter((a) => a.pass === 2).map((a) => a.ref));
  const notRetried = ordered.filter((o) => !attempted2.has(o.ref)).map((o) => ({ ref: o.ref, reason: pass1.stop!.reason !== "COMPLETED" ? `NOT_RETRIED_${pass1.stop!.reason}` : pass2?.stop?.reason === "BUDGET_STOP" ? "NOT_RETRIED_BUDGET" : `NOT_RETRIED_${pass2?.stop?.reason ?? "UNKNOWN"}` }));

  // ---- canonical selection, variance, manifest ----
  const byRefAttempts = new Map<string, RecoveryAttempt[]>();
  for (const a of attempts) byRefAttempts.set(a.ref, [...(byRefAttempts.get(a.ref) ?? []), a]);
  const cases = loopCandidates.map((c) => { const as = byRefAttempts.get(c.ref) ?? []; const canon = canonicalAttempt(as); return { ref: c.ref, discoveryId: c.discoveryId, band: bandOf(c.operativeChars), attempts: as.map((a) => ({ attempt: a.attempt, recovery: a.recovery, compile: a.compile.outcome, verify: a.verify.outcome, verificationStatus: a.verify.status, packageComplete: a.package?.complete ?? null, packageHash: a.package?.packageHash ?? null, evidenceFile: a.evidenceFile, p1Occurrence: a.p1Occurrence })), finalRecovered: canon !== null, canonical: canon ? { attempt: canon.attempt, evidenceFile: canon.evidenceFile, packageFile: canon.package?.file ?? null, packageHash: canon.package?.packageHash ?? null, verificationStatus: canon.verify.status, rule: "first complete recovered attempt" } : null, notRetried: notRetried.find((n) => n.ref === c.ref)?.reason ?? null }; });
  const finalStop = pass2?.stop ?? pass1.stop!;
  save("03-run-manifest", {
    schema: "p3-conmed-benchmark-recovery-manifest.v1", evidenceLabel: EVIDENCE_LABEL, runId, model: LOCKED_MODEL, timeoutMs: PER_CANDIDATE_TIMEOUT_MS, concurrencyUsed: CONCURRENCY, autoRetry: AUTO_RETRY, fallbackModel: FALLBACK_MODEL, premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD, maxAttemptsPerCase: MAX_ATTEMPTS_PER_CASE, reservationPolicy,
    targets: loopCandidates, excluded: EXCLUDED_REF,
    resume: resume ? { segmentDir: resume.segmentDir, priorAttempts: resume.priorAttempts.length, inFlightAborted: resume.inFlightAborted, accountingCorrections: resume.accountingCorrections, seededPrior: resume.seededPrior } : null,
    pass1: { attempted: attempts.filter((a) => a.pass === 1).length, stop: pass1.stop, outcomes: tally(attempts.filter((a) => a.pass === 1)) },
    pass2: { plan: pass2Plan, attempted: attempts.filter((a) => a.pass === 2).length, stop: pass2?.stop ?? null, outcomes: tally(attempts.filter((a) => a.pass === 2)), notRetried },
    totalAttempts: attempts.length, targetsWithTwoAttempts: cases.filter((c) => c.attempts.length === 2).map((c) => c.ref),
    finalRecovered: cases.filter((c) => c.finalRecovered).map((c) => c.ref), finalNotRecovered: cases.filter((c) => !c.finalRecovered).map((c) => c.ref),
    cases, variance: varianceReport(byRefAttempts),
    p1Occurrences: attempts.filter((a) => a.p1Occurrence).map((a) => ({ ref: a.ref, attempt: a.attempt, evidenceFile: a.evidenceFile, packageFile: a.package?.file ?? null })),
    stopReason: finalStop.reason, stoppedAtCandidate: finalStop.candidateAtStop, stoppedAt: finalStop.at, creditExhaustionSignal: finalStop.signal,
    spend: { exactUsd: ledger.exactSpendUsd, timeoutReservationsRetainedUsd: ledger.retainedUnknownUsd, outstandingReservedUsd: ledger.outstandingReservedUsd, committedUsd: ledger.committedUsd, remainingUsd: ledger.remainingUsd, ceilingUsd: RECOVERY_CEILING_USD, stopAtUsd: RECOVERY_STOP_AT_USD, preflightUsd: preflight.spendUsd, amendmentPipelineUsd: amendmentUsd, seededPrior: resume?.seededPrior ?? null, note: resume ? "cumulative across segments: includes the seeded prior" : "this run only" },
  });
  console.log(`\nDONE attempts=${attempts.length} recovered=${cases.filter((c) => c.finalRecovered).length}/${cases.length} stop=${finalStop.reason} committed $${ledger.committedUsd.toFixed(4)} of $${RECOVERY_CEILING_USD}`);
}

function tally(rows: RecoveryAttempt[]): Record<string, number> { return rows.reduce((a: Record<string, number>, r) => { a[r.recovery] = (a[r.recovery] ?? 0) + 1; return a; }, {}); }

if (process.argv[1]?.endsWith("run-benchmark-recovery.ts")) void main();
