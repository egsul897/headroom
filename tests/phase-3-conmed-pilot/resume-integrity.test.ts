/**
 * Tests for the resume path specifically: the logic that decides what is reused, what is
 * retried, what counts as a genuine execution failure, and how the full-regeneration
 * projection is built.
 *
 * These matter because the resume is where a pilot can quietly launder a bad result: by
 * reusing a record it should have re-run, by escalating on a semantic outcome it dislikes,
 * or by projecting a full-corpus cost from a flattering subset.
 */
import { describe, expect, it } from "vitest";
import { classifyPrior, classifyFailure, timeoutForensics } from "../../scripts/p3-conmed-pilot/resume";
import { costModel, project, FULL_POPULATION, SONNET5_PER_CANDIDATE_USD } from "../../scripts/p3-conmed-pilot/cost-model";
import type { CandidateRecord } from "../../scripts/p3-conmed-pilot/compile-run";

const base: CandidateRecord = {
  discoveryId: "d1",
  documentId: "conmed-doc-a-eighth-ar-credit-agreement",
  sourceSectionRef: "7.1",
  role: "BASKET",
  sourceTextHash: "h",
  sourceTextChars: 1000,
  model: "deepseek/deepseek-v4-flash-0731",
  tier: 1,
  escalated: false,
  escalationReason: null,
  status: "REVIEW_REQUIRED",
  failureReasons: [],
  rules: 1,
  definitions: 0,
  sufficiencySummary: { COMPLETE: 1 },
  toolCalls: 2,
  inputTokens: 1000,
  outputTokens: 100,
  attemptCount: 1,
  actualCostUsd: 0.002,
  outputHash: "",
  wallClockMs: 1000,
};

const frozenFor = (r: CandidateRecord, result: { status: string; rules: unknown[]; definitions: unknown[] }) =>
  new Map([[`${r.discoveryId}::${r.tier}`, { result: result as never }]]);

// The record's outputHash is computed over exactly this shape in compile-run.record().
const hashOf = (result: { status: string; rules: unknown[]; definitions: unknown[] }) =>
  require("node:crypto").createHash("sha256").update(JSON.stringify({ rules: result.rules, definitions: result.definitions, status: result.status })).digest("hex");

describe("§1 — reuse is gated on evidence verification", () => {
  it("reuses a prior success whose frozen response still hashes correctly", () => {
    const result = { status: "REVIEW_REQUIRED", rules: [{ a: 1 }], definitions: [] };
    const r = { ...base, outputHash: hashOf(result) };
    const d = classifyPrior(r, frozenFor(r, result));
    expect(d.disposition).toBe("REUSE_SUCCESS");
    expect(d.evidenceVerified).toBe(true);
  });

  it("re-runs a prior success whose frozen response no longer matches its recorded hash", () => {
    const result = { status: "REVIEW_REQUIRED", rules: [{ a: 1 }], definitions: [] };
    const tampered = { status: "REVIEW_REQUIRED", rules: [{ a: 999 }], definitions: [] };
    const r = { ...base, outputHash: hashOf(result) };
    const d = classifyPrior(r, frozenFor(r, tampered));
    expect(d.disposition).toBe("RETRY_CORRUPT_EVIDENCE");
    expect(d.evidenceVerified).toBe(false);
  });

  it("re-runs a prior success whose evidence is missing entirely", () => {
    const r = { ...base, outputHash: "whatever" };
    expect(classifyPrior(r, new Map()).disposition).toBe("RETRY_CORRUPT_EVIDENCE");
  });

  it("retries a 402 and a timeout, because neither is a definitive model outcome", () => {
    const refused = { ...base, status: "FAILED", failureReasons: ["PROVIDER_FAILURE"] };
    const timedOut = { ...base, status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"] };
    expect(classifyPrior(refused, new Map()).disposition).toBe("RETRY_402");
    expect(classifyPrior(timedOut, new Map()).disposition).toBe("RETRY_TIMEOUT");
  });
});

describe("§7 — the execution-failure taxonomy", () => {
  it("names each execution failure kind distinctly", () => {
    const k = (reasons: string[]) => classifyFailure({ ...base, status: "FAILED", failureReasons: reasons });
    expect(k(["PROVIDER_FAILURE"])).toBe("PROVIDER_FAILURE");
    expect(k(["MODEL_SCHEMA_FAILURE"])).toBe("MODEL_SCHEMA_FAILURE");
    expect(k(["WALL_CLOCK_TIMEOUT"])).toBe("WALL_CLOCK_TIMEOUT");
    expect(k(["TOOL_BUDGET_EXHAUSTED"])).toBe("TOOL_FAILURE");
    expect(k(["CONTEXT_WINDOW_EXCEEDED"])).toBe("CONTEXT_FAILURE");
    expect(k(["SOMETHING_ELSE"])).toBe("OTHER_EXECUTION_FAILURE");
  });

  it("a semantic outcome is not an execution failure", () => {
    // REVIEW_REQUIRED, PARTIAL and an honest abstention are results, not breakages.
    expect(classifyFailure({ ...base, status: "REVIEW_REQUIRED", failureReasons: ["SEMANTIC_INVENTORY_COVERAGE_GAP"] })).toBe("NOT_AN_EXECUTION_FAILURE");
    expect(classifyFailure({ ...base, status: "COMPLETED", failureReasons: ["UNSUPPORTED_BY_SOURCE"] })).toBe("NOT_AN_EXECUTION_FAILURE");
  });

  it("a PROVIDER_FAILURE is classified before anything else it is bundled with", () => {
    // The 402 envelopes carried a tail of downstream accountability reasons; the
    // provider refusal is the cause and must win, or the taxonomy misattributes it.
    const kind = classifyFailure({ ...base, status: "FAILED", failureReasons: ["PROVIDER_FAILURE", "SHARD_INCOMPLETE", "PARTIAL_COMPILATION", "SEMANTIC_INVENTORY_COVERAGE_GAP"] });
    expect(kind).toBe("PROVIDER_FAILURE");
  });
});

describe("§3 — timeout forensics", () => {
  it("records whether the provider was still billing when the ceiling hit", () => {
    const streaming = timeoutForensics({ ...base, status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"], inputTokens: 29000, outputTokens: 1200, toolCalls: 3, wallClockMs: 900000 }, 900000);
    expect(streaming.providerActivityContinuedToCeiling).toBe(true);
    expect(streaming.evidenceToolCalls).toBe(3);
    expect(streaming.lastObservedAction).toMatch(/3 evidence tool call/);

    const stalled = timeoutForensics({ ...base, status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"], inputTokens: 0, outputTokens: 0, toolCalls: 0, wallClockMs: 900000 }, 900000);
    expect(stalled.providerActivityContinuedToCeiling).toBe(false);
    expect(stalled.lastObservedAction).toMatch(/no tool call/);
  });

  it("carries the source size, so a size/timeout correlation can be judged rather than assumed", () => {
    const f = timeoutForensics({ ...base, sourceTextChars: 9312, status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"] }, 900000);
    expect(f.sourceTextChars).toBe(9312);
    expect(f.ceilingMs).toBe(900000);
  });
});

describe("§10 — the full-regeneration cost model", () => {
  it("a higher escalation rate costs more, and the Sonnet term dominates", () => {
    const perCandidate = 0.003;
    const five = project("5%", 0.05, perCandidate);
    const twenty = project("20%", 0.2, perCandidate);
    expect(twenty.totalUsd).toBeGreaterThan(five.totalUsd);
    // At any plausible rate the escalation term exceeds the Tier-1 term, which is the
    // whole reason the escalation rate is the decision variable and model price is not.
    expect(twenty.tier2CostUsd).toBeGreaterThan(twenty.tier1CostUsd);
  });

  it("projects over the real A_FULL population, not the CONMED pilot's", () => {
    const p = project("x", 0.1, 0.003);
    expect(p.tier1Candidates).toBe(FULL_POPULATION);
    expect(FULL_POPULATION).toBe(1274);
    expect(p.escalatedCandidates).toBe(Math.round(1274 * 0.1));
  });

  it("saving is measured against the all-Sonnet baseline", () => {
    const p = project("zero escalation", 0, 0.003);
    const allSonnet = FULL_POPULATION * SONNET5_PER_CANDIDATE_USD;
    expect(p.savingVsAllSonnetPct).toBeCloseTo(((allSonnet - FULL_POPULATION * 0.003) / allSonnet) * 100, 1);
  });

  it("cost per candidate is computed over COMPLETED candidates, not attempts", () => {
    // A timed-out candidate still bills for what it streamed. Dividing by attempts would
    // make a completion look cheaper than it is and understate a full run.
    const records: CandidateRecord[] = [
      { ...base, status: "REVIEW_REQUIRED", actualCostUsd: 0.004 },
      { ...base, discoveryId: "d2", status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"], actualCostUsd: 0.006 },
    ];
    const m = costModel(records);
    expect(m.basis.completedOnTier1).toBe(1);
    expect(m.basis.tier1CostPerCompletedCandidateUsd).toBeCloseTo(0.01, 4);
  });

  it("excludes provider refusals from the rates it projects from", () => {
    const records: CandidateRecord[] = [
      { ...base, status: "REVIEW_REQUIRED", actualCostUsd: 0.003 },
      { ...base, discoveryId: "d2", status: "FAILED", failureReasons: ["PROVIDER_FAILURE"], actualCostUsd: 0 },
    ];
    const m = costModel(records);
    expect(m.basis.candidatesReachingModel).toBe(1);
    expect(m.basis.observedTimeoutRate).toBe(0);
  });

  it("the alternative-timeout scenario is labelled as arithmetic, never as a prediction", () => {
    const m = costModel([{ ...base, status: "REVIEW_REQUIRED", actualCostUsd: 0.003 }]);
    expect(m.alternativeTimeoutScenario.premise).toMatch(/does NOT establish/);
    expect(m.alternativeTimeoutScenario.caveat).toMatch(/Not a prediction/);
  });
});
