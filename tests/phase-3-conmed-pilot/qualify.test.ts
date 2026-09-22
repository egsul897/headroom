/**
 * Guards on the targeted qualification stage. The failure this protects against is
 * spending the selection budget on the wrong question — grading a model on whether its
 * ANSWER was liked rather than on whether it can EXECUTE the protocol.
 */
import { describe, expect, it } from "vitest";
import { SHORTLIST, EXCLUDED_MODELS, FROZEN_PROBES, PER_MODEL_CEILING_USD, TOTAL_SELECTION_CEILING_USD, gradeProbe, shouldEliminate, extractGatewayCost, type ProbeResult } from "../../scripts/p3-conmed-pilot/qualify";
import { QUALIFICATION_TIMEOUT_MS, assertAllowedTimeout, ForbiddenTimeoutError, DEFAULT_CANDIDATE_TIMEOUT_MS } from "../../scripts/p3-conmed-pilot/timeout-policy";
import { isPremiumById } from "../../scripts/p3-conmed-pilot/premium-lock";
import type { CandidateRecord } from "../../scripts/p3-conmed-pilot/compile-run";

function rec(over: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    discoveryId: "d", documentId: "doc", sourceSectionRef: "7.2(f)", role: "COVENANT", sourceTextHash: "h",
    sourceTextChars: 149, model: "m", tier: 1, escalated: false, escalationReason: null, status: "REVIEW_REQUIRED",
    failureReasons: [], rules: 1, definitions: 0, sufficiencySummary: {}, toolCalls: 1, inputTokens: 28467,
    outputTokens: 3843, attemptCount: 1, actualCostUsd: 0.001, outputHash: "o", wallClockMs: 51_000, ...over,
  };
}
const pr = (over: Partial<ProbeResult>): ProbeResult => ({ slot: "A_SHORT_CONTROL", sourceSectionRef: "7.8(b)", outcome: "PASS", status: "REVIEW_REQUIRED", failureReasons: [], rules: 1, definitions: 0, toolCalls: 0, inputTokens: 1, outputTokens: 1, elapsedMs: 1000, gatewayCostUsd: 0, provider: "x", sortOptionApplied: "cost", ...over });

describe("shortlist discipline (§1)", () => {
  it("is exactly the five authorized models, in the authorized order", () => {
    expect([...SHORTLIST]).toEqual(["inception/mercury-2.5", "openai/gpt-5-nano", "zai/glm-4.7-flash", "xiaomi/mimo-v2.5", "deepseek/deepseek-v4-flash"]);
  });

  it("excludes the model that already failed the real-workload gate", () => {
    expect([...EXCLUDED_MODELS]).toContain("alibaba/qwen3.7-flash");
    expect([...SHORTLIST]).not.toContain("alibaba/qwen3.7-flash");
  });

  it("contains no premium model", () => {
    for (const m of SHORTLIST) expect(isPremiumById(m)).toBe(false);
  });
});

describe("frozen probes (§3)", () => {
  it("is exactly three probes covering control, evidence-tool and hard/long", () => {
    expect(FROZEN_PROBES).toHaveLength(3);
    expect(FROZEN_PROBES.map((p) => p.slot)).toEqual(["A_SHORT_CONTROL", "B_EVIDENCE_TOOL_REQUIRED", "C_HARD_LONG"]);
  });

  it("marks the evidence probe — and only it — as requiring tool use", () => {
    expect(FROZEN_PROBES.filter((p) => p.toolUseRequired).map((p) => p.slot)).toEqual(["B_EVIDENCE_TOOL_REQUIRED"]);
  });

  it("uses 7.2(k) as the hard/long probe", () => {
    expect(FROZEN_PROBES.find((p) => p.slot === "C_HARD_LONG")!.sourceSectionRef).toBe("7.2(k)");
  });
});

describe("qualification timeout (§4)", () => {
  it("is 240 seconds, below the population floor", () => {
    expect(QUALIFICATION_TIMEOUT_MS).toBe(240_000);
    expect(QUALIFICATION_TIMEOUT_MS).toBeLessThan(DEFAULT_CANDIDATE_TIMEOUT_MS);
  });

  it("is allowed only under the qualification tier, never as a population ceiling", () => {
    expect(() => assertAllowedTimeout(240_000, { tier: "QUALIFICATION" })).not.toThrow();
    expect(() => assertAllowedTimeout(240_000)).toThrow(ForbiddenTimeoutError);
  });

  it("cannot be used to smuggle in some other short ceiling", () => {
    expect(() => assertAllowedTimeout(120_000, { tier: "QUALIFICATION" })).toThrow(/not authorized/);
  });

  it("cannot be combined with long-retry authorization", () => {
    expect(() => assertAllowedTimeout(240_000, { tier: "QUALIFICATION", longRetryAuthorized: true })).toThrow(/may not be combined/);
  });
});

describe("grading is execution-only (§6)", () => {
  it("PASSES a REVIEW_REQUIRED answer — an unfavourable outcome is not a failure", () => {
    expect(gradeProbe(rec({ status: "REVIEW_REQUIRED" }), false, false)).toBe("PASS");
  });

  it("PASSES PARTIAL and HONEST_UNRESOLVED too", () => {
    expect(gradeProbe(rec({ status: "PARTIAL" }), false, false)).toBe("PASS");
    expect(gradeProbe(rec({ status: "HONEST_UNRESOLVED" }), false, false)).toBe("PASS");
  });

  it("FAILS the evidence probe when no tool was invoked, however good the answer", () => {
    expect(gradeProbe(rec({ toolCalls: 0, rules: 5 }), true, false)).toBe("TOOL_FAIL");
  });

  it("does not require tool use on the probes that do not demand it", () => {
    expect(gradeProbe(rec({ toolCalls: 0 }), false, false)).toBe("PASS");
  });

  it("classifies a timeout, a schema failure and an empty result distinctly", () => {
    expect(gradeProbe(rec({ status: "FAILED", rules: 0 }), false, true)).toBe("TIMEOUT_240");
    expect(gradeProbe(rec({ failureReasons: ["MODEL_SCHEMA_FAILURE"] }), false, false)).toBe("SCHEMA_FAIL");
    expect(gradeProbe(rec({ rules: 0, definitions: 0 }), false, false)).toBe("EXECUTION_FAIL");
  });
});

describe("early exit (§5)", () => {
  it("eliminates immediately on evidence-tool failure, before other probes run", () => {
    const out = shouldEliminate([pr({ slot: "B_EVIDENCE_TOOL_REQUIRED", outcome: "TOOL_FAIL" })]);
    expect(out.eliminate).toBe(true);
    expect(out.reason).toMatch(/WITHOUT using the evidence tools/);
  });

  it("eliminates on any two failures", () => {
    expect(shouldEliminate([pr({ outcome: "TIMEOUT_240" }), pr({ outcome: "SCHEMA_FAIL" })]).eliminate).toBe(true);
  });

  it("does NOT eliminate on a single non-tool failure — the third probe still decides", () => {
    expect(shouldEliminate([pr({ outcome: "TIMEOUT_240" })]).eliminate).toBe(false);
  });

  it("does not eliminate a clean run", () => {
    expect(shouldEliminate([pr({}), pr({}), pr({})]).eliminate).toBe(false);
  });
});

describe("spend caps (§8, §9)", () => {
  it("holds the per-model and total ceilings at the authorized values", () => {
    expect(PER_MODEL_CEILING_USD).toBe(0.1);
    expect(TOTAL_SELECTION_CEILING_USD).toBe(0.5);
  });

  it("keeps the total below the broader mission budget so it cannot quietly draw on it", () => {
    expect(TOTAL_SELECTION_CEILING_USD).toBeLessThan(5);
    expect(PER_MODEL_CEILING_USD * SHORTLIST.length).toBeLessThanOrEqual(TOTAL_SELECTION_CEILING_USD);
  });
});

describe("gateway cost capture (§2)", () => {
  it("reads the real billed cost, provider and applied sort from provider_metadata", () => {
    const raw = { provider_metadata: { gateway: { cost: "0.00000233", generationId: "gen_1", routing: { finalProvider: "inception", sort: { option: "cost" } } } } };
    expect(extractGatewayCost(raw)).toEqual({ provider: "inception", gatewayCostUsd: 0.00000233, sortOptionApplied: "cost", generationId: "gen_1" });
  });

  it("degrades safely when a response carries no gateway metadata", () => {
    expect(extractGatewayCost({})).toEqual({ provider: null, gatewayCostUsd: 0, sortOptionApplied: null, generationId: null });
  });
});
