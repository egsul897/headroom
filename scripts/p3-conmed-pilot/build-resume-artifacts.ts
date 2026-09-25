/**
 * Writes docs/phase-3-conmed-low-cost-pilot-complete/ — the record of the completed
 * CONMED pilot, after the gateway credit was restored and the sealed population finished.
 *
 * The prior blocked run's artifacts are NOT overwritten. They remain the honest record of
 * what was known when the account ran dry, and this directory supersedes them for
 * planning without erasing them.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { rescore } from "./rescore";
import { costModel } from "./cost-model";
import { classifyFailure, type ExecutionFailureKind } from "./resume";
import type { CandidateRecord } from "./compile-run";

const ROOT = process.cwd();
const RUN = "/tmp/claude-0/pilot/resume";
const OUT = "docs/phase-3-conmed-low-cost-pilot-complete";
const GENERATED_AT = "2026-09-21T00:00:00.000Z";
export const EVIDENCE_LABEL = "LOW_COST_DIAGNOSTIC_PIPELINE";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const readRun = (n: string) => JSON.parse(fs.readFileSync(path.join(RUN, `${n}.json`), "utf8"));
const git = (c: string) => execSync(`git ${c}`, { cwd: ROOT, encoding: "utf8" }).trim();

function write(name: string, body: unknown) {
  const p = path.join(ROOT, OUT, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2) + "\n";
  fs.writeFileSync(p, text, "utf8");
  return { name, bytes: Buffer.byteLength(text), sha256: sha256(text) };
}

const FROZEN_SURFACES = ["lib/contract-model/", "tests/fixtures/unseen-packages/", "docs/phase-3-v3.1-final-reconciliation/", "docs/phase-3-final-closure-resolution/", "docs/phase-3-remediation/", "docs/phase-3-current-pipeline-regeneration/", "docs/phase-3-conmed-low-cost-pilot/"] as const;

export function freezeProof(startingSha: string) {
  const perSurface = FROZEN_SURFACES.map((surface) => ({ surface, changed: git(`diff --stat ${startingSha} -- ${surface}`).length > 0 }));
  const files = git(`diff --name-only ${startingSha}`).split("\n").filter(Boolean);
  return {
    startingSha,
    perSurface,
    frozenSurfacesChanged: perSurface.filter((s) => s.changed).map((s) => s.surface),
    productionDiffIsEmpty: !perSurface.find((s) => s.surface === "lib/contract-model/")!.changed,
    benchmarkFilesChanged: perSurface.filter((s) => s.surface.startsWith("tests/fixtures/") || s.surface.startsWith("docs/phase-3-v3.1")).filter((s) => s.changed).length,
    priorBlockedRunPreserved: !perSurface.find((s) => s.surface === "docs/phase-3-conmed-low-cost-pilot/")!.changed,
    filesChangedSinceStartingSha: files,
    allChangesAreAdditive: files.every((f) => f.startsWith("scripts/p3-conmed-pilot/") || f.startsWith(`${OUT}/`) || f.startsWith("tests/phase-3-conmed-pilot/")),
  };
}

/** §9 — execution quality, over the only denominator that describes the model. */
export function executionQuality(final: CandidateRecord[]) {
  const byKind = final.reduce((a: Record<string, number>, r) => {
    const k = classifyFailure(r);
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  const reachedModel = final.filter((r) => !r.failureReasons.includes("PROVIDER_FAILURE"));
  const completed = reachedModel.filter((r) => r.status !== "FAILED");
  const timeouts = reachedModel.filter((r) => classifyFailure(r) === "WALL_CLOCK_TIMEOUT");
  const escalated = final.filter((r) => r.escalated);

  return {
    totalCandidates: final.length,
    requestsReachingModel: reachedModel.length,
    http402Remaining: final.filter((r) => r.failureReasons.includes("PROVIDER_FAILURE")).length,
    completed: completed.length,
    trueExecutionSuccessRate: Number((completed.length / Math.max(1, reachedModel.length)).toFixed(4)),
    timeouts: timeouts.length,
    timeoutRate: Number((timeouts.length / Math.max(1, reachedModel.length)).toFixed(4)),
    schemaFailures: byKind.MODEL_SCHEMA_FAILURE ?? 0,
    toolFailures: byKind.TOOL_FAILURE ?? 0,
    contextFailures: byKind.CONTEXT_FAILURE ?? 0,
    otherExecutionFailures: byKind.OTHER_EXECUTION_FAILURE ?? 0,
    escalations: escalated.length,
    escalationRate: Number((escalated.length / Math.max(1, reachedModel.length)).toFixed(4)),
    failureKindTally: byKind as Record<ExecutionFailureKind, number>,
    totalToolCalls: final.reduce((s, r) => s + r.toolCalls, 0),
    candidatesUsingTools: final.filter((r) => r.toolCalls > 0).length,
    denominatorNote:
      "trueExecutionSuccessRate, timeoutRate and escalationRate all use requestsReachingModel as denominator. A candidate refused with HTTP 402 never reached the model and cannot be evidence about it.",
  };
}

/** §11 — the completed pilot's classification. */
export function classify(q: ReturnType<typeof executionQuality>, deltas: Record<string, number>) {
  const populationComplete = q.http402Remaining === 0;
  const executionAdequate = q.trueExecutionSuccessRate >= 0.8 && q.schemaFailures === 0;
  const materialImprovement = (deltas.newSubstantiveRepresentations ?? 0) > 0 && (deltas.creditAfter ?? 0) > (deltas.creditBefore ?? 0);

  if (!populationComplete) return { verdict: "CONMED_PILOT_BLOCKED_PROVIDER_CREDIT", why: `${q.http402Remaining} candidates still refused with HTTP 402.` };
  if (!executionAdequate && !materialImprovement) {
    return { verdict: "CONMED_PILOT_MODEL_LIMITED", why: `Execution success ${(q.trueExecutionSuccessRate * 100).toFixed(1)}% with ${q.schemaFailures} schema failures, and no material coverage improvement. The architecture cannot be judged fairly from this.` };
  }
  if (materialImprovement && executionAdequate) {
    return { verdict: "CONMED_PILOT_STRONG_SIGNAL", why: `The cheap model completed ${(q.trueExecutionSuccessRate * 100).toFixed(1)}% of requests that reached it with zero schema failures, and produced ${deltas.newSubstantiveRepresentations} substantive representations where the frozen evidence had none — moving CREDIT from ${deltas.creditBefore} to ${deltas.creditAfter} of ${deltas.casesMeasured} measured cases.` };
  }
  if (materialImprovement) {
    return { verdict: "CONMED_PILOT_MIXED_SIGNAL", why: `Real coverage improvement (${deltas.newSubstantiveRepresentations} substantive representations, CREDIT ${deltas.creditBefore} → ${deltas.creditAfter}), but execution quality (${(q.trueExecutionSuccessRate * 100).toFixed(1)}% success, ${q.timeouts} timeouts) leaves the conclusion qualified.` };
  }
  return { verdict: "CONMED_PILOT_NO_ARCHITECTURAL_IMPROVEMENT", why: `Execution was adequate (${(q.trueExecutionSuccessRate * 100).toFixed(1)}%) and the full population ran, yet benchmark-relevant coverage did not materially improve.` };
}

export function buildAll() {
  const start = "e4561d1";
  const meta = readRun("10-run-meta");
  const plan = readRun("01-resume-plan");
  const health = readRun("02-health-check");
  const retriedT1 = readRun("04-retried-tier1") as CandidateRecord[];
  const retriedT2 = readRun("05-retried-tier2") as CandidateRecord[];
  const timeoutForensics = readRun("06-timeout-forensics");
  const final = readRun("07-final-records") as CandidateRecord[];
  const frozen = readRun("08-frozen-responses") as { discoveryId: string; model: string; tier: number; result: { status: string; failureReasons?: string[]; rules?: unknown[]; definitions?: unknown[] } }[];
  const notRun = readRun("09-not-run");

  const scored = rescore(final);
  const q = executionQuality(final);
  const verdict = classify(q, scored.deltas);
  const costs = costModel(final);

  const priorCost = 0.0434;
  const incremental = meta.incrementalCostUsd;
  const inTok = final.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  const outTok = final.reduce((s, r) => s + (r.outputTokens ?? 0), 0);

  const written = [
    write("01-resume-plan.json", { artifact: "§1 — idempotent resume plan.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, resumedFrom: start, harnessRedesigned: false, ...plan, evidenceVerificationRule: "A prior success is reused only when its frozen response re-hashes to the outputHash recorded at the time. A mismatch forces a re-run rather than a silent carry-forward." }),
    write("02-provider-health-check.json", { artifact: "§5 — one small previously-refused candidate, before the pool.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, ...health }),
    write("03-retried-tier1.json", { artifact: "§1/§2 — the retry pass.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, model: meta.tier1Model, count: retriedT1.length, records: retriedT1 }),
    write("04-tier2-escalations.json", { artifact: "§7 — escalations, genuine execution failures only.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, model: meta.tier2Model, count: retriedT2.length, taxonomy: "PROVIDER_FAILURE | MODEL_SCHEMA_FAILURE | TOOL_FAILURE | WALL_CLOCK_TIMEOUT | CONTEXT_FAILURE | OTHER_EXECUTION_FAILURE", neverEscalated: "NO_CREDIT, PARTIAL, HONEST_UNRESOLVED, REVIEW_REQUIRED, unsupported legal semantics, unfavourable benchmark outcome — all semantic results, not execution failures.", records: retriedT2 }),
    write("05-timeout-forensics.json", { artifact: "§3 — per-timeout forensics, recorded before any judgement about the ceiling.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, ceilingMs: meta.perCandidateTimeoutMs, ceilingUnchangedDuringRun: true, count: timeoutForensics.length, records: timeoutForensics }),
    write("06-final-records.json", { artifact: "§6 — every candidate's definitive outcome.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, count: final.length, records: final }),
    write("07-frozen-responses.json", { artifact: "§8 — responses frozen before scoring.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, count: frozen.length, fidelityPolicy: "Full fidelity for every attempt that reached the model; compact record for refusals, which contain no model output.", responsesWithModelOutput: frozen.filter((f) => (f.result.rules ?? []).length > 0 || (f.result.definitions ?? []).length > 0 || f.result.status !== "FAILED"), refusedOrEmpty: frozen.filter((f) => (f.result.rules ?? []).length === 0 && (f.result.definitions ?? []).length === 0 && f.result.status === "FAILED").map((f) => ({ discoveryId: f.discoveryId, model: f.model, tier: f.tier, status: f.result.status, failureReasons: f.result.failureReasons, resultHash: sha256(JSON.stringify(f.result)) })) }),
    write("08-nine-case-rescore.json", { artifact: "§8 — all nine CONMED cases against corrected V3.1.1. NOT canonical (§11).", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, canonical47CaseScoreModified: false, mappingRule: scored.mappingRule, deltas: scored.deltas, cases: scored.cases }),
    write("09-execution-quality.json", { artifact: "§9 — execution quality and failure taxonomy.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, ...q }),
    write("10-cost-model.json", { artifact: "§10 — full-regeneration projection from measured telemetry.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, ...costs }),
    write("11-cost-report.json", { artifact: "§4 — cost, at the model's real gateway price.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, priorRunCostUsd: priorCost, incrementalCostUsd: incremental, totalPilotCostUsd: Number((priorCost + incremental).toFixed(4)), ceilingUsd: meta.ceilingUsd, ceilingExceeded: incremental > meta.ceilingUsd, inputTokens: inTok, outputTokens: outTok, costPerCompletedCandidateUsd: costs.basis.tier1CostPerCompletedCandidateUsd, notRun, telemetryCaveat: "Recomputed from the gateway's published per-token price for the model that served each call; production's telemetry rate card knows only Sonnet and Opus and was not changed." }),
    write("12-verdict.json", { artifact: "§11 — classification of the completed pilot.", evidenceLabel: EVIDENCE_LABEL, generatedAt: GENERATED_AT, ...verdict, populationComplete: q.http402Remaining === 0, productionFreeze: freezeProof(start), supersedes: "docs/phase-3-conmed-low-cost-pilot/12-verdict.json (CONMED_PILOT_BLOCKED_PROVIDER_CREDIT). That directory is preserved unchanged as the honest record of the blocked run.", doNotConfuse: "§11: cheap-model weakness is not compiler-architecture weakness." }),
  ];

  return { written, scored, q, verdict, costs, meta, final, retriedT1, retriedT2, timeoutForensics, notRun, incremental, priorCost, inTok, outTok, health, plan };
}

if (process.argv[1]?.endsWith("build-resume-artifacts.ts")) {
  const r = buildAll();
  console.table(r.written);
  console.log(JSON.stringify({ verdict: r.verdict, deltas: r.scored.deltas, execution: r.q, projections: r.costs.projections }, null, 2));
}
