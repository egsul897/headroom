/**
 * Writes docs/phase-3-cheap-model-bakeoff/ — the record of the §4/§5 sequential
 * cheap-model bakeoff and the §15 full gate matrix.
 *
 * Deterministic and free. It reads only what run-bakeoff.ts already froze to disk plus
 * the free gateway catalogue snapshot; it makes no model call of its own. Every number
 * here is recomputed from those files rather than transcribed from a console log, so a
 * partial run produces a truthful partial artifact instead of a plausible-looking whole.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { discoverModels } from "./bakeoff";
import { evaluateGate, type ModelBakeoffResult } from "./run-bakeoff";
import {
  PREMIUM_MODEL_BUDGET_USD,
  VIABILITY_CEILING_USD_PER_CANDIDATE,
  PREFERRED_CEILING_USD_PER_CANDIDATE,
  OBSERVED_INPUT_TOKENS_PER_CANDIDATE,
  OBSERVED_OUTPUT_TOKENS_PER_CANDIDATE,
  classifyFailureCategory,
} from "./premium-lock";
import type { ProbeSlot } from "./bakeoff";
import type { CandidateRecord } from "./compile-run";

const ROOT = process.cwd();
const RUN = "/tmp/claude-0/pilot/bakeoff";
const OUT = "docs/phase-3-cheap-model-bakeoff";
export const EVIDENCE_LABEL = "LOW_COST_DIAGNOSTIC_PIPELINE";
/** The full sealed CONMED population after exact dedup, as the pilot measured it. */
export const SEALED_POPULATION_AFTER_DEDUP = 137;
export const SPEND_CEILING_USD = 5;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const git = (c: string) => execSync(`git ${c}`, { cwd: ROOT, encoding: "utf8" }).trim();

export function readRun<T>(name: string): T | null {
  const p = path.join(RUN, `${name}.json`);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null;
}

export function write(name: string, body: unknown) {
  const p = path.join(ROOT, OUT, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2) + "\n";
  fs.writeFileSync(p, text, "utf8");
  return { name, bytes: Buffer.byteLength(text), sha256: sha256(text) };
}

/**
 * §15 — one row per model that was actually dispatched to, with the gate recomputed from
 * the frozen per-candidate records rather than trusted from the runner's own summary.
 * A row whose recomputed verdict disagrees with the stored one is reported, not hidden.
 */
export function gateMatrix(results: ModelBakeoffResult[]) {
  return results.map((r) => {
    const recomputed = evaluateGate(r);
    return {
      model: r.model,
      pricePerMtokInput: r.inputPerMtok,
      pricePerMtokOutput: r.outputPerMtok,
      attempted: r.attempted,
      completed: r.completed,
      completionRatePct: Number((r.completionRate * 100).toFixed(1)),
      schemaFailures: r.schemaFailures,
      schemaFailureRatePct: Number((r.schemaFailureRate * 100).toFixed(1)),
      toolFailures: r.toolFailures,
      zeroTokenStalls: r.zeroTokenStalls,
      wallClockTimeouts: r.timeouts,
      providerFailures: r.providerFailures,
      medianWallClockSeconds: Math.round(r.medianWallClockMs / 1000),
      p90WallClockSeconds: Math.round(r.p90WallClockMs / 1000),
      toolUseWorks: r.toolUseWorks,
      structuredOutputsParse: r.structuredOutputsParse,
      spendUsd: r.spendUsd,
      costPerCompletedCandidateUsd: r.costPerCompletedCandidateUsd,
      passesGate: r.passesGate,
      gateReasons: r.gateReasons,
      gateVerdictReproducesFromFrozenRecords: recomputed.passesGate === r.passesGate,
    };
  });
}

/**
 * The failure taxonomy, per model. The three categories are kept strictly separate
 * because only MODEL_EXECUTION can justify trying a different model: a provider refusal
 * says nothing about the model, and an unfavourable semantic answer is not a failure at
 * all.
 */
export function failureTaxonomy(results: ModelBakeoffResult[]) {
  return results.map((r) => {
    const byCategory: Record<string, number> = { PROVIDER_OR_HARNESS: 0, MODEL_EXECUTION: 0, SEMANTIC_OUTCOME: 0 };
    const byReason: Record<string, number> = {};
    for (const c of r.perCandidate) {
      const cat = classifyFailureCategory(c.status, c.failureReasons, (c.inputTokens ?? 0) + (c.outputTokens ?? 0));
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      for (const reason of c.failureReasons.length > 0 ? c.failureReasons : [c.status]) byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
    return {
      model: r.model,
      byCategory,
      byReason,
      onlyModelExecutionJustifiesAnotherModel: true,
      modelExecutionFailures: byCategory.MODEL_EXECUTION,
    };
  });
}

/**
 * §14 — the question the bakeoff exists to answer, stated as a measurement rather than
 * an impression: of the real compiler workload, what share can a sub-$0.01-per-candidate
 * model finish cleanly when it is given a healthy gateway and no concurrency pressure?
 */
export function subCentCompletion(results: ModelBakeoffResult[], probes: ProbeSlot[]) {
  const subCent = results.filter((r) => {
    const est = (OBSERVED_INPUT_TOKENS_PER_CANDIDATE * r.inputPerMtok + OBSERVED_OUTPUT_TOKENS_PER_CANDIDATE * r.outputPerMtok) / 1e6;
    return est < PREFERRED_CEILING_USD_PER_CANDIDATE;
  });
  const attempted = subCent.reduce((s, r) => s + r.attempted, 0);
  const completed = subCent.reduce((s, r) => s + r.completed, 0);
  const byAxis = probes.map((p) => {
    const rows = subCent.flatMap((r) => r.perCandidate.filter((c) => c.discoveryId === p.discoveryId).map((c) => ({ model: r.model, c })));
    return {
      axis: p.axis,
      sourceSectionRef: p.sourceSectionRef,
      sourceTextChars: p.sourceTextChars,
      attempts: rows.length,
      completions: rows.filter((x) => x.c.status !== "FAILED").length,
      outcomes: rows.map((x) => ({ model: x.model, status: x.c.status, failureReasons: x.c.failureReasons })),
    };
  });
  return {
    question: "What percentage of the real compiler workload can a sub-$0.01-per-candidate model complete cleanly under healthy sequential conditions?",
    conditions: "gateway funded and health-checked at both tiers before the run; concurrency 1; unchanged production compiler; 900s per-candidate wall-clock ceiling",
    modelsInScope: subCent.map((r) => r.model),
    attempted,
    completed,
    completionRatePct: attempted === 0 ? null : Number(((completed / attempted) * 100).toFixed(1)),
    answerIsMeasuredNotEstimated: attempted > 0,
    byAxis,
    caveat:
      "The denominator is the 12-candidate probe set, which is deliberately weighted toward hard structural shapes (longest, deepest, most cross-referenced) and toward candidates that previously failed. It is not a random sample of the population, so this rate is a floor for the typical case, not a population mean.",
  };
}

/**
 * Per-candidate latency recovered from the run log.
 *
 * The first bakeoff run predates the fix that measures elapsed time in the runner, so its
 * frozen records carry wallClockMs: null on every candidate — including the ones that
 * completed. Falling back to the timeout ceiling for those would report a ~900s mean for a
 * model whose completions actually took 18-427s, which is wrong in the pessimistic
 * direction and would misprice the whole population projection.
 *
 * The console line for each completion carries the measured seconds, so they are parsed
 * back out here. This is a SECONDARY source, used only where the frozen record has no
 * latency of its own, and it is labelled as such wherever it is consumed.
 */
export function latencyFromLog(logPath = "/tmp/claude-0/pilot/bakeoff.log"): Map<string, Map<string, number>> {
  const byModel = new Map<string, Map<string, number>>();
  if (!fs.existsSync(logPath)) return byModel;
  let current: string | null = null;
  for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
    const header = /^=== (\S+) \(/.exec(line);
    if (header) {
      current = header[1]!;
      byModel.set(current, new Map());
      continue;
    }
    if (!current) continue;
    // "  AXIS_NAME   7.2(f)   STATUS  rules= 1 tools= 0 tok=.../... 124s $0.0030"
    const row = /^\s{2}[A-Z_0-9]+\s+(\S+)\s+\S+\s+rules=.*?\s(\d+)s\s/.exec(line);
    if (row) byModel.get(current)!.set(row[1]!, Number(row[2]) * 1000);
  }
  return byModel;
}

/**
 * Wall clock, not dollars, is the constraint the probe set exposes. This projects the
 * sealed population under the measured per-candidate latency, at the concurrency the
 * mission permits.
 */
export function wallClockProjection(results: ModelBakeoffResult[], perCandidateTimeoutMs: number, fromLog?: Map<string, Map<string, number>>) {
  return results.map((r) => {
    const logged = fromLog?.get(r.model);
    const observed = r.perCandidate
      .map((c) => c.wallClockMs ?? logged?.get(c.sourceSectionRef) ?? 0)
      .filter((x) => x > 0);
    const timeoutCost = r.timeouts * perCandidateTimeoutMs;
    const meanMs = observed.length === 0 ? perCandidateTimeoutMs : (observed.reduce((s, x) => s + x, 0) + timeoutCost) / (observed.length + r.timeouts);
    const hours = (n: number, conc: number) => Number(((n * meanMs) / conc / 3_600_000).toFixed(1));
    return {
      model: r.model,
      meanWallClockSecondsPerCandidate: Math.round(meanMs / 1000),
      latencySource: r.perCandidate.some((c) => c.wallClockMs !== null) ? "frozen per-candidate records" : observed.length > 0 ? "run log (frozen records carry no latency for this run)" : "none — every candidate charged at the timeout ceiling",
      latencySampleSize: observed.length,
      includesTimeoutsAtCeiling: r.timeouts,
      sealedPopulationAfterDedup: SEALED_POPULATION_AFTER_DEDUP,
      hoursAtConcurrency1: hours(SEALED_POPULATION_AFTER_DEDUP, 1),
      hoursAtConcurrency2: hours(SEALED_POPULATION_AFTER_DEDUP, 2),
      note: "Concurrency above 2 is not projected: §8 forbids returning to 6, and no evidence exists for anything between.",
    };
  });
}

export function startingState(startingSha: string) {
  const catalogue = discoverModels();
  const byTier = catalogue.reduce((a: Record<string, number>, m) => { a[m.tier] = (a[m.tier] ?? 0) + 1; return a; }, {});
  return {
    startingSha,
    branch: git("rev-parse --abbrev-ref HEAD"),
    evidenceLabel: EVIDENCE_LABEL,
    spendCeilingUsd: SPEND_CEILING_USD,
    premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD,
    viabilityCeilingUsdPerCandidate: VIABILITY_CEILING_USD_PER_CANDIDATE,
    preferredCeilingUsdPerCandidate: PREFERRED_CEILING_USD_PER_CANDIDATE,
    catalogueSize: catalogue.length,
    catalogueByTier: byTier,
    eligibleForBakeoff: catalogue.filter((m) => m.tier === "PREFERRED" || m.tier === "VIABLE").length,
    observedTokenShapePerCandidate: { input: OBSERVED_INPUT_TOKENS_PER_CANDIDATE, output: OBSERVED_OUTPUT_TOKENS_PER_CANDIDATE },
  };
}
