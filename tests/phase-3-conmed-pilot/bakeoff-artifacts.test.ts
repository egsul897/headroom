/**
 * Guards on the bakeoff artifact layer. These exist because every number the mission
 * report quotes comes out of these functions, and a silently wrong denominator would be
 * indistinguishable from a real finding.
 */
import { describe, expect, it } from "vitest";
import { gateMatrix, failureTaxonomy, subCentCompletion, wallClockProjection, SEALED_POPULATION_AFTER_DEDUP } from "../../scripts/p3-conmed-pilot/build-bakeoff-artifacts";
import { evaluateGate, type ModelBakeoffResult } from "../../scripts/p3-conmed-pilot/run-bakeoff";
import { PREFERRED_CEILING_USD_PER_CANDIDATE, OBSERVED_INPUT_TOKENS_PER_CANDIDATE, OBSERVED_OUTPUT_TOKENS_PER_CANDIDATE } from "../../scripts/p3-conmed-pilot/premium-lock";
import type { CandidateRecord } from "../../scripts/p3-conmed-pilot/compile-run";
import type { ProbeSlot } from "../../scripts/p3-conmed-pilot/bakeoff";

const TIMEOUT_MS = 900_000;

function rec(over: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    discoveryId: "d1",
    documentId: "conmed-doc-a-eighth-ar-credit-agreement",
    sourceSectionRef: "7.2(a)",
    role: "COVENANT",
    sourceTextHash: "h",
    sourceTextChars: 100,
    model: "cheap/model",
    tier: 1,
    escalated: false,
    escalationReason: null,
    status: "SUCCESS",
    failureReasons: [],
    rules: 1,
    definitions: 0,
    sufficiencySummary: { COMPLETE: 1 },
    toolCalls: 1,
    inputTokens: 29408,
    outputTokens: 2296,
    attemptCount: 1,
    actualCostUsd: 0.001,
    outputHash: "o",
    wallClockMs: 60_000,
    ...over,
  };
}

function result(over: Partial<ModelBakeoffResult> = {}): ModelBakeoffResult {
  const perCandidate = over.perCandidate ?? [rec()];
  const completed = perCandidate.filter((r) => r.status !== "FAILED").length;
  const base = {
    model: "cheap/model",
    provider: "vercel-ai-gateway",
    inputPerMtok: 0.03,
    outputPerMtok: 0.13,
    attempted: perCandidate.length,
    completed,
    completionRate: completed / perCandidate.length,
    schemaFailures: 0,
    schemaFailureRate: 0,
    toolFailures: 0,
    zeroTokenStalls: 0,
    timeouts: perCandidate.filter((r) => r.failureReasons.includes("WALL_CLOCK_TIMEOUT")).length,
    providerFailures: 0,
    medianWallClockMs: 60_000,
    p90WallClockMs: 60_000,
    inputTokens: 29408,
    outputTokens: 2296,
    spendUsd: 0.001,
    costPerCompletedCandidateUsd: 0.001,
    toolUseWorks: true,
    structuredOutputsParse: true,
    ...over,
    perCandidate,
  };
  return { ...base, ...evaluateGate(base) } as ModelBakeoffResult;
}

describe("gate matrix", () => {
  it("recomputes each stored gate verdict from the frozen records and says whether it reproduces", () => {
    const rows = gateMatrix([result()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.gateVerdictReproducesFromFrozenRecords).toBe(true);
  });

  it("flags a stored verdict that does NOT follow from the stored metrics", () => {
    // A hand-tampered row: the metrics fail the gate, but passesGate claims otherwise.
    const tampered = { ...result({ perCandidate: [rec({ status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"] })] }), passesGate: true, gateReasons: [] };
    expect(gateMatrix([tampered])[0]!.gateVerdictReproducesFromFrozenRecords).toBe(false);
  });

  it("reports wall clock in seconds, not milliseconds", () => {
    expect(gateMatrix([result({ medianWallClockMs: 90_000 })])[0]!.medianWallClockSeconds).toBe(90);
  });
});

describe("failure taxonomy", () => {
  it("keeps a provider refusal out of the model-execution bucket", () => {
    const rows = failureTaxonomy([result({ perCandidate: [rec({ status: "FAILED", failureReasons: ["PROVIDER_FAILURE"], inputTokens: 0, outputTokens: 0 })] })]);
    expect(rows[0]!.byCategory.PROVIDER_OR_HARNESS).toBe(1);
    expect(rows[0]!.modelExecutionFailures).toBe(0);
  });

  it("counts an unfavourable but well-formed answer as a semantic outcome, not a failure of the model", () => {
    const rows = failureTaxonomy([result({ perCandidate: [rec({ status: "REVIEW_REQUIRED" })] })]);
    expect(rows[0]!.byCategory.SEMANTIC_OUTCOME).toBe(1);
    expect(rows[0]!.byCategory.MODEL_EXECUTION).toBe(0);
  });

  it("counts a schema failure as model execution — the one category that can justify another model", () => {
    const rows = failureTaxonomy([result({ perCandidate: [rec({ status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE"] })] })]);
    expect(rows[0]!.byCategory.MODEL_EXECUTION).toBe(1);
  });
});

describe("sub-cent completion rate", () => {
  const probes: ProbeSlot[] = [{ axis: "SHORT_SIMPLE_PROHIBITION", rationale: "r", discoveryId: "d1", sourceSectionRef: "7.2(a)", sourceTextChars: 100, priorOutcome: "COMPLETED" }];

  it("includes a model priced under the preferred ceiling", () => {
    const est = (OBSERVED_INPUT_TOKENS_PER_CANDIDATE * 0.03 + OBSERVED_OUTPUT_TOKENS_PER_CANDIDATE * 0.13) / 1e6;
    expect(est).toBeLessThan(PREFERRED_CEILING_USD_PER_CANDIDATE);
    expect(subCentCompletion([result()], probes).modelsInScope).toEqual(["cheap/model"]);
  });

  it("excludes a model priced at or above the preferred ceiling", () => {
    const out = subCentCompletion([result({ inputPerMtok: 3, outputPerMtok: 15 })], probes);
    expect(out.modelsInScope).toEqual([]);
    expect(out.completionRatePct).toBeNull();
    expect(out.answerIsMeasuredNotEstimated).toBe(false);
  });

  it("does not report a rate when nothing was attempted, rather than reporting 0%", () => {
    expect(subCentCompletion([], probes).completionRatePct).toBeNull();
  });
});

describe("wall-clock projection", () => {
  it("charges a timeout at the full ceiling instead of dropping it from the mean", () => {
    const withTimeout = result({ perCandidate: [rec({ wallClockMs: 60_000 }), rec({ discoveryId: "d2", status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"], wallClockMs: null })] });
    const p = wallClockProjection([withTimeout], TIMEOUT_MS)[0]!;
    // (60s + 900s) / 2 = 480s. Dropping the timeout would have said 60s.
    expect(p.meanWallClockSecondsPerCandidate).toBe(480);
    expect(p.includesTimeoutsAtCeiling).toBe(1);
  });

  it("projects the sealed population, not the probe set", () => {
    const p = wallClockProjection([result()], TIMEOUT_MS)[0]!;
    expect(p.sealedPopulationAfterDedup).toBe(SEALED_POPULATION_AFTER_DEDUP);
    expect(p.hoursAtConcurrency1).toBeCloseTo((SEALED_POPULATION_AFTER_DEDUP * 60_000) / 3_600_000, 1);
    expect(p.hoursAtConcurrency2).toBeCloseTo(p.hoursAtConcurrency1 / 2, 1);
  });
});
