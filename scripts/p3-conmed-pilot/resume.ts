/**
 * §1 — idempotent resume of the sealed CONMED pilot.
 *
 * The harness is NOT redesigned: population, dedup rule, Tier-1 model, escalation
 * criteria, compiler prompt and scoring contract all carry over from e4561d1 unchanged.
 * This file only decides WHICH candidates need re-running and merges the result.
 *
 * Resume rule (§1):
 *   - a prior non-FAILED record is reused, never re-spent, provided its stored evidence
 *     still hashes to what was recorded;
 *   - PROVIDER_FAILURE (HTTP 402) and WALL_CLOCK_TIMEOUT are retried, because neither is
 *     a definitive model outcome — the first never reached the model, the second hit a
 *     ceiling rather than an answer;
 *   - anything else that failed execution is retried too.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { INSTRUMENT_KEY, operativeTextFor, sha256 } from "./pipeline";
import { dedupExact } from "./dedup";
import { PER_CANDIDATE_TIMEOUT_MS, buildInput, callerFor, loadModel, maxTokensFor, prepare, record, runPool, shouldEscalate, withTimeout, type CandidateRecord } from "./compile-run";

const PRIOR = "/tmp/claude-0/pilot/run";
const OUT = "/tmp/claude-0/pilot/resume";
const CEILING_USD = 10;
const STOP_AT_USD = 9;

const readPrior = (n: string) => JSON.parse(fs.readFileSync(path.join(PRIOR, `${n}.json`), "utf8"));
function save(name: string, body: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 2));
}

export type ResumeDisposition = "REUSE_SUCCESS" | "RETRY_402" | "RETRY_TIMEOUT" | "RETRY_OTHER" | "RETRY_CORRUPT_EVIDENCE";

/**
 * §1 — a prior success is only reusable if its stored evidence still verifies. The
 * frozen response is re-hashed and compared with the hash recorded at the time; a
 * mismatch means the record cannot be trusted and the candidate is re-run rather than
 * quietly carried forward.
 */
export function classifyPrior(r: CandidateRecord, frozenByIdTier: Map<string, { result: SemanticCompilationResult; resultHash?: string }>): { disposition: ResumeDisposition; evidenceVerified: boolean } {
  if (r.status !== "FAILED") {
    const frozen = frozenByIdTier.get(`${r.discoveryId}::${r.tier}`);
    if (!frozen) return { disposition: "RETRY_CORRUPT_EVIDENCE", evidenceVerified: false };
    const recomputed = sha256(JSON.stringify({ rules: frozen.result.rules, definitions: frozen.result.definitions, status: frozen.result.status }));
    if (recomputed !== r.outputHash) return { disposition: "RETRY_CORRUPT_EVIDENCE", evidenceVerified: false };
    return { disposition: "REUSE_SUCCESS", evidenceVerified: true };
  }
  if (r.failureReasons.includes("PROVIDER_FAILURE")) return { disposition: "RETRY_402", evidenceVerified: true };
  if (r.failureReasons.includes("WALL_CLOCK_TIMEOUT")) return { disposition: "RETRY_TIMEOUT", evidenceVerified: true };
  return { disposition: "RETRY_OTHER", evidenceVerified: true };
}

/** §7 — the execution-failure taxonomy the mission asks escalation to distinguish. */
export type ExecutionFailureKind = "PROVIDER_FAILURE" | "MODEL_SCHEMA_FAILURE" | "TOOL_FAILURE" | "WALL_CLOCK_TIMEOUT" | "CONTEXT_FAILURE" | "OTHER_EXECUTION_FAILURE" | "NOT_AN_EXECUTION_FAILURE";

export function classifyFailure(r: CandidateRecord): ExecutionFailureKind {
  if (r.status !== "FAILED") return "NOT_AN_EXECUTION_FAILURE";
  const f = r.failureReasons;
  if (f.includes("PROVIDER_FAILURE")) return "PROVIDER_FAILURE";
  if (f.includes("MODEL_SCHEMA_FAILURE")) return "MODEL_SCHEMA_FAILURE";
  if (f.includes("WALL_CLOCK_TIMEOUT")) return "WALL_CLOCK_TIMEOUT";
  if (f.includes("TOOL_BUDGET_EXHAUSTED") || f.some((x) => x.includes("TOOL"))) return "TOOL_FAILURE";
  if (f.includes("CONTEXT_WINDOW_EXCEEDED") || f.includes("OUTPUT_TRUNCATED")) return "CONTEXT_FAILURE";
  return "OTHER_EXECUTION_FAILURE";
}

/** §3 — the forensic record a timeout must leave behind, so the ceiling can be judged later. */
export interface TimeoutForensics {
  discoveryId: string;
  sourceSectionRef: string;
  sourceTextChars: number;
  evidenceToolCalls: number;
  elapsedMs: number;
  ceilingMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number;
  providerActivityContinuedToCeiling: boolean;
  lastObservedAction: string;
}

export function timeoutForensics(r: CandidateRecord, ceilingMs: number): TimeoutForensics {
  // Tokens billed at all means the provider was streaming when the ceiling hit; zero
  // tokens with a full elapsed window means it stalled before producing anything.
  const billed = (r.inputTokens ?? 0) > 0 || (r.outputTokens ?? 0) > 0;
  return {
    discoveryId: r.discoveryId,
    sourceSectionRef: r.sourceSectionRef,
    sourceTextChars: r.sourceTextChars,
    evidenceToolCalls: r.toolCalls,
    elapsedMs: r.wallClockMs ?? ceilingMs,
    ceilingMs,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.actualCostUsd,
    providerActivityContinuedToCeiling: billed,
    lastObservedAction: r.toolCalls > 0 ? `${r.toolCalls} evidence tool call(s) completed; no submit_compilation before the ceiling` : "no tool call and no submission before the ceiling",
  };
}

/** §5 — one small previously-refused candidate, before the pool is launched. */
export async function healthCheck(candidate: DiscoveredCandidate, bundles: Map<string, unknown>, stages: Awaited<ReturnType<typeof prepare>>["stages"], operativeState: unknown, effects: unknown[]) {
  const m = loadModel("deepseek/deepseek-v4-flash-0731");
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(m));
  const caller = callerFor(m.id);
  const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, operativeState, effects);
  const started = Date.now();
  try {
    const result = await withTimeout(compileCovenantToIR(input, { caller }), PER_CANDIDATE_TIMEOUT_MS);
    const rec = record(candidate, input, result, m, 1, null);
    const refused = rec.failureReasons.includes("PROVIDER_FAILURE");
    return {
      passed: !refused && (rec.inputTokens ?? 0) > 0,
      discoveryId: candidate.discoveryId,
      sourceSectionRef: candidate.normalizedSourceRef,
      sourceTextChars: input.operativeSourceText.length,
      http402: refused,
      modelReceivedRequest: (rec.inputTokens ?? 0) > 0,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      costUsd: rec.actualCostUsd,
      costIncreased: rec.actualCostUsd > 0,
      toolUseWorkflowStarted: rec.toolCalls > 0 || rec.rules > 0,
      status: rec.status,
      failureReasons: rec.failureReasons,
      elapsedMs: Date.now() - started,
      record: rec,
      result,
    };
  } catch (err) {
    return {
      passed: false,
      discoveryId: candidate.discoveryId,
      sourceSectionRef: candidate.normalizedSourceRef,
      sourceTextChars: input.operativeSourceText.length,
      http402: false,
      modelReceivedRequest: false,
      inputTokens: null,
      outputTokens: null,
      costUsd: 0,
      costIncreased: false,
      toolUseWorkflowStarted: false,
      status: "THREW",
      failureReasons: [err instanceof Error ? err.name : "UnknownError"],
      elapsedMs: Date.now() - started,
      record: null,
      result: null,
    };
  }
}

async function main() {
  const healthOnly = process.argv.includes("--health-only");
  const concurrency = Number(process.env.RESUME_CONCURRENCY ?? 6);

  const { stages, pop, rehydrated, unresolved, bundles } = await prepare();
  const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  const byId = new Map(keep.map((c) => [c.discoveryId, c]));

  const priorT1 = readPrior("03-tier1") as CandidateRecord[];
  const priorFrozen = readPrior("06-frozen-responses") as { discoveryId: string; model: string; tier: number; result: SemanticCompilationResult }[];
  const frozenByIdTier = new Map(priorFrozen.map((f) => [`${f.discoveryId}::${f.tier}`, f]));

  const dispositions = priorT1.map((r) => ({ r, ...classifyPrior(r, frozenByIdTier) }));
  const reuse = dispositions.filter((d) => d.disposition === "REUSE_SUCCESS");
  const retry = dispositions.filter((d) => d.disposition !== "REUSE_SUCCESS");
  console.log(`resume plan: reuse ${reuse.length}, retry ${retry.length} (402 ${retry.filter((d) => d.disposition === "RETRY_402").length}, timeout ${retry.filter((d) => d.disposition === "RETRY_TIMEOUT").length}, other ${retry.filter((d) => d.disposition === "RETRY_OTHER").length}, corrupt ${retry.filter((d) => d.disposition === "RETRY_CORRUPT_EVIDENCE").length})`);
  save("01-resume-plan", { reuse: reuse.length, retry: retry.length, byDisposition: dispositions.reduce((a: Record<string, number>, d) => { a[d.disposition] = (a[d.disposition] ?? 0) + 1; return a; }, {}), evidenceVerificationFailures: dispositions.filter((d) => !d.evidenceVerified).map((d) => d.r.discoveryId) });

  // Deterministic stages the compiler's tool access needs, rebuilt exactly as before.
  const stageCaller = getStageCaller();
  const amendment = await runAmendmentPipeline(stageCaller, { documents: stages.documents, packageGraph: stages.packageGraph, index: stages.index });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: stages.index, allEffects: amendment.effects });

  // --- §5 provider health check, before the pool ---
  const probeTarget = retry
    .filter((d) => d.disposition === "RETRY_402" && d.r.sourceTextChars > 0)
    .sort((a, b) => a.r.sourceTextChars - b.r.sourceTextChars)[0]!;
  const health = await healthCheck(byId.get(probeTarget.r.discoveryId)!, bundles, stages, operativeState, amendment.effects);
  save("02-health-check", { ...health, record: undefined, result: undefined });
  console.log(`health check ${probeTarget.r.sourceSectionRef} (${health.sourceTextChars}ch): passed=${health.passed} http402=${health.http402} tokens=${health.inputTokens}/${health.outputTokens} cost=$${health.costUsd.toFixed(5)} status=${health.status}`);

  if (health.http402 || !health.modelReceivedRequest) {
    console.log("\nGATEWAY_CREDIT_STILL_UNAVAILABLE — pool not launched.");
    save("03-blocked", { verdict: "GATEWAY_CREDIT_STILL_UNAVAILABLE", health: { ...health, record: undefined, result: undefined } });
    return;
  }
  if (healthOnly) {
    console.log("--health-only: stopping after the health check.");
    return;
  }

  // --- retry pass ---
  const m1 = loadModel("deepseek/deepseek-v4-flash-0731");
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(m1));
  const caller1 = callerFor(m1.id);
  let spent = health.costUsd;
  const notRun: { discoveryId: string; sourceSectionRef: string; reason: string }[] = [];
  const newFrozen: { discoveryId: string; model: string; tier: number; result: SemanticCompilationResult }[] = [];
  if (health.result) newFrozen.push({ discoveryId: health.discoveryId, model: m1.id, tier: 1, result: health.result });

  const runOne = async (candidate: DiscoveredCandidate, model: typeof m1, caller: ReturnType<typeof callerFor>, tier: 1 | 2, escalationReason: string | null): Promise<CandidateRecord> => {
    const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, operativeState, amendment.effects);
    try {
      const result = await withTimeout(compileCovenantToIR(input, { caller }), PER_CANDIDATE_TIMEOUT_MS);
      newFrozen.push({ discoveryId: candidate.discoveryId, model: model.id, tier, result });
      const rec = record(candidate, input, result, model, tier, escalationReason);
      spent += rec.actualCostUsd;
      return rec;
    } catch (err) {
      const name = err instanceof Error ? err.name : "UnknownError";
      const synthetic = { status: "FAILED", failureReasons: [name === "CandidateTimeoutError" ? "WALL_CLOCK_TIMEOUT" : "TRANSPORT_OR_INTERNAL_ERROR"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult;
      newFrozen.push({ discoveryId: candidate.discoveryId, model: model.id, tier, result: synthetic });
      return record(candidate, input, synthetic, model, tier, escalationReason);
    }
  };

  const toRetry = retry.filter((d) => d.r.discoveryId !== health.discoveryId);
  let done = 0;
  const retried = await runPool(toRetry, concurrency, async (d) => {
    if (spent >= STOP_AT_USD) {
      notRun.push({ discoveryId: d.r.discoveryId, sourceSectionRef: d.r.sourceSectionRef, reason: `budget guard: $${spent.toFixed(2)} spent, stopping before the $${CEILING_USD} ceiling` });
      return null;
    }
    const rec = await runOne(byId.get(d.r.discoveryId)!, m1, caller1, 1, null);
    done++;
    if (done % 10 === 0 || rec.status === "FAILED") console.log(`  [T1 ${done}/${toRetry.length}] ${rec.sourceSectionRef} ${rec.status} rules=${rec.rules} $${spent.toFixed(4)}`);
    return rec;
  });
  const retriedRecords = retried.filter((r): r is CandidateRecord => r !== null);
  if (health.record) retriedRecords.push(health.record);
  save("04-retried-tier1", retriedRecords);
  console.log(`\nretry pass: ${retriedRecords.length} run, ${retriedRecords.filter((r) => r.status !== "FAILED").length} usable, $${spent.toFixed(4)}`);

  // --- Tier 2: genuine execution failures only (§7) ---
  const escalate = retriedRecords
    .map((r) => ({ r, kind: classifyFailure(r), decision: shouldEscalate(newFrozen.find((f) => f.discoveryId === r.discoveryId && f.tier === 1)!.result) }))
    .filter((x) => x.decision.escalate && x.kind !== "NOT_AN_EXECUTION_FAILURE");
  console.log(`escalating ${escalate.length} genuine execution failures to Sonnet 5`);
  const m2 = loadModel("anthropic/claude-sonnet-5");
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(m2));
  const caller2 = callerFor(m2.id);
  const t2 = await runPool(escalate, Math.max(2, Math.floor(concurrency / 2)), async (x) => {
    if (spent >= STOP_AT_USD) {
      notRun.push({ discoveryId: x.r.discoveryId, sourceSectionRef: x.r.sourceSectionRef, reason: `budget guard during escalation: $${spent.toFixed(2)} spent` });
      return null;
    }
    const rec = await runOne(byId.get(x.r.discoveryId)!, m2, caller2, 2, x.kind);
    console.log(`  [T2] ${rec.sourceSectionRef} ${rec.status} rules=${rec.rules} (was ${x.kind}) $${spent.toFixed(4)}`);
    return rec;
  });
  const tier2Records = t2.filter((r): r is CandidateRecord => r !== null);
  save("05-retried-tier2", tier2Records);

  // --- merge: reused prior successes + this pass's outcomes ---
  const finalById = new Map<string, CandidateRecord>();
  for (const d of reuse) finalById.set(d.r.discoveryId, d.r);
  for (const r of retriedRecords) finalById.set(r.discoveryId, r);
  for (const r of tier2Records) finalById.set(r.discoveryId, r);
  const final = [...finalById.values()].sort((a, b) => a.sourceSectionRef.localeCompare(b.sourceSectionRef));

  const timeouts = final.filter((r) => classifyFailure(r) === "WALL_CLOCK_TIMEOUT");
  save("06-timeout-forensics", timeouts.map((r) => timeoutForensics(r, PER_CANDIDATE_TIMEOUT_MS)));
  save("07-final-records", final);
  save("08-frozen-responses", newFrozen.map((f) => ({ ...f, resultHash: sha256(JSON.stringify(f.result)) })));
  save("09-not-run", notRun);
  save("10-run-meta", {
    priorSuccessesReused: reuse.length,
    prior402Retried: retry.filter((d) => d.disposition === "RETRY_402").length,
    priorTimeoutsRetried: retry.filter((d) => d.disposition === "RETRY_TIMEOUT").length,
    priorCorruptEvidenceRetried: retry.filter((d) => d.disposition === "RETRY_CORRUPT_EVIDENCE").length,
    tier1Model: m1.id,
    tier2Model: m2.id,
    tier2Escalations: tier2Records.length,
    concurrency,
    sealedPopulation: pop.all.length,
    dedupedPopulation: keep.length,
    finalRecords: final.length,
    notRun: notRun.length,
    unresolvedNodeKeys: unresolved,
    ceilingUsd: CEILING_USD,
    incrementalCostUsd: Number(spent.toFixed(4)),
    perCandidateTimeoutMs: PER_CANDIDATE_TIMEOUT_MS,
  });

  console.log(`\nDONE. ${final.length} candidates, ${final.filter((r) => r.status !== "FAILED").length} usable, ${final.reduce((s, r) => s + r.rules, 0)} rules, $${spent.toFixed(4)} incremental, ${notRun.length} not run, ${timeouts.length} timeouts.`);
}

// Guarded: importing this module (a test does, for classifyPrior/classifyFailure/
// timeoutForensics) must never attempt a live run. An unguarded top-level call made the
// test suite dial the gateway.
if (process.argv[1]?.endsWith("resume.ts")) void main();
