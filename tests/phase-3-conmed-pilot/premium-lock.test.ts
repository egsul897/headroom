/**
 * §18 — tests proving the premium spend lock holds.
 *
 * The previous pilot burned credit because execution failures escalated automatically to
 * Sonnet 5 before the underlying provider problem had been isolated. These tests make that
 * a structural impossibility rather than a matter of remembering, which is what §10 asks
 * for: "The pilot must not depend on operator memory."
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PREMIUM_MODEL_BUDGET_USD,
  PremiumModelBlockedError,
  assertNotPremium,
  classifyFailureCategory,
  estimatedCostPerCandidate,
  isPremiumById,
  isPremiumByPrice,
  mayTryAnotherModel,
  VIABILITY_CEILING_USD_PER_CANDIDATE,
} from "../../scripts/p3-conmed-pilot/premium-lock";
import { discoverModels, capabilityFloor, buildProbeSet } from "../../scripts/p3-conmed-pilot/bakeoff";
import { sealedPopulation, rehydrateNodeIds, buildDeterministicStages, operativeTextFor } from "../../scripts/p3-conmed-pilot/pipeline";
import { dedupExact } from "../../scripts/p3-conmed-pilot/dedup";

const ROOT = process.cwd();
const src = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("§10 — premium model budget is zero and dispatch is blocked", () => {
  it("the premium budget is exactly $0", () => {
    expect(PREMIUM_MODEL_BUDGET_USD).toBe(0);
  });

  it("blocks every premium model the gateway lists, by id", () => {
    for (const id of ["anthropic/claude-sonnet-5", "anthropic/claude-sonnet-4.6", "anthropic/claude-opus-5", "anthropic/claude-opus-4.8", "anthropic/claude-fable-5.1", "openai/gpt-5", "openai/gpt-5-pro", "openai/gpt-6-astra", "moonshotai/kimi-k3"]) {
      expect(isPremiumById(id), `${id} not recognised as premium`).toBe(true);
      expect(() => assertNotPremium(id)).toThrow(PremiumModelBlockedError);
    }
  });

  it("blocks by price even when the id is unfamiliar — the ceiling is the backstop", () => {
    // A hypothetical new premium id the patterns do not know about.
    const expensive = { input: 3 / 1e6, output: 15 / 1e6 };
    expect(isPremiumByPrice(expensive.input, expensive.output)).toBe(true);
    expect(() => assertNotPremium("newvendor/unknown-premium-2", expensive)).toThrow(PremiumModelBlockedError);
  });

  it("throws BEFORE dispatch, not after", () => {
    // The error names the model and the reason, so a blocked call is diagnosable from the
    // message alone without needing the request to have been attempted.
    try {
      assertNotPremium("anthropic/claude-sonnet-5");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PremiumModelBlockedError);
      expect((e as Error).message).toContain("anthropic/claude-sonnet-5");
      expect((e as Error).message).toContain("PREMIUM_MODEL_BUDGET is $0");
    }
  });

  it("permits a genuinely cheap model", () => {
    expect(() => assertNotPremium("deepseek/deepseek-v4-flash-0731", { input: 0.076 / 1e6, output: 0.15 / 1e6 })).not.toThrow();
  });

  it("the cost estimate uses the pilot's own measured token shape", () => {
    // 29,408 in / 2,296 out, measured from a completed CONMED compilation.
    const est = estimatedCostPerCandidate(2 / 1e6, 10 / 1e6);
    expect(est).toBeCloseTo(29408 * 2e-6 + 2296 * 10e-6, 6);
    expect(est).toBeGreaterThan(VIABILITY_CEILING_USD_PER_CANDIDATE);
  });
});

describe("§2 — no failure category can trigger premium escalation", () => {
  it("a semantic result is never an execution failure", () => {
    for (const r of ["REVIEW_REQUIRED", "HONEST_UNRESOLVED", "NO_CREDIT", "PARTIAL", "UNSUPPORTED_BY_SOURCE", "LOW_CONFIDENCE"]) {
      const cat = classifyFailureCategory("REVIEW_REQUIRED", [r], 1000);
      expect(cat, `${r} misclassified`).toBe("SEMANTIC_OUTCOME");
      expect(mayTryAnotherModel(cat)).toBe(false);
    }
  });

  it("a provider failure is never a model failure", () => {
    for (const r of ["PROVIDER_FAILURE", "HTTP_402", "HTTP_429", "CONNECTION_RESET", "GATEWAY_TIMEOUT", "WALL_CLOCK_TIMEOUT"]) {
      const cat = classifyFailureCategory("FAILED", [r], 0);
      expect(cat, `${r} misclassified`).toBe("PROVIDER_OR_HARNESS");
      expect(mayTryAnotherModel(cat)).toBe(false);
    }
  });

  it("a zero-token stall is a provider failure, not a model failure", () => {
    // Accepted but never served: no tokens billed, no output. This is the exact shape
    // that was previously mistaken for model incapacity.
    expect(classifyFailureCategory("FAILED", [], 0)).toBe("PROVIDER_OR_HARNESS");
    expect(mayTryAnotherModel(classifyFailureCategory("FAILED", [], 0))).toBe(false);
  });

  it("a provider signal wins over the accountability symptoms bundled with it", () => {
    const cat = classifyFailureCategory("FAILED", ["PROVIDER_FAILURE", "SHARD_INCOMPLETE", "PARTIAL_COMPILATION", "SEMANTIC_INVENTORY_COVERAGE_GAP"], 0);
    expect(cat).toBe("PROVIDER_OR_HARNESS");
  });

  it("only a genuine model-execution failure may justify trying another model", () => {
    const cat = classifyFailureCategory("FAILED", ["MODEL_SCHEMA_FAILURE"], 5000);
    expect(cat).toBe("MODEL_EXECUTION");
    expect(mayTryAnotherModel(cat)).toBe(true);
  });

  it("even a model-execution failure only permits ANOTHER CHEAP model, never premium", () => {
    // The ladder in §13 ends at CHEAP_MODEL_EXECUTION_UNRESOLVED; the lock is what makes
    // that terminal rather than advisory.
    expect(() => assertNotPremium("anthropic/claude-sonnet-5")).toThrow(PremiumModelBlockedError);
  });
});

describe("§3/§4 — model discovery and cost exclusion", () => {
  it("every premium family in the catalogue is excluded from the bakeoff", () => {
    const models = discoverModels();
    const eligible = models.filter((m) => m.tier === "PREFERRED" || m.tier === "VIABLE");
    for (const m of eligible) {
      expect(isPremiumById(m.id), `${m.id} is premium but eligible`).toBe(false);
      expect(m.estimatedCostPerCandidateUsd).toBeLessThan(VIABILITY_CEILING_USD_PER_CANDIDATE);
    }
    expect(models.some((m) => m.tier === "EXCLUDED_AS_PREMIUM")).toBe(true);
  });

  it("an unpriced model is excluded rather than assumed cheap", () => {
    // NaN pricing both evades a cost ceiling and corrupts an ordering comparator.
    const models = discoverModels();
    const unpriced = models.filter((m) => m.inputPerMtok === -1);
    for (const m of unpriced) expect(m.tier).toBe("EXCLUDED_FOR_COST");
  });

  it("the eligible list is totally ordered by cost", () => {
    const eligible = discoverModels().filter((m) => m.tier === "PREFERRED" || m.tier === "VIABLE");
    for (let i = 1; i < eligible.length; i++) {
      expect(eligible[i - 1]!.estimatedCostPerCandidateUsd).toBeLessThanOrEqual(eligible[i]!.estimatedCostPerCandidateUsd);
    }
  });

  it("the capability floor is the compiler's requirement, not a quality preference", () => {
    expect(capabilityFloor({ type: "language", tags: ["tool-use"], max_tokens: 64000, context_window: 200000 } as never).ok).toBe(true);
    expect(capabilityFloor({ type: "language", tags: [], max_tokens: 64000, context_window: 200000 } as never).ok).toBe(false);
    expect(capabilityFloor({ type: "language", tags: ["tool-use"], max_tokens: 8192, context_window: 200000 } as never).ok).toBe(false);
  });

  it("model selection never inspects a benchmark result", () => {
    const body = src("scripts/p3-conmed-pilot/bakeoff.ts");
    for (const forbidden of ["CASE-", "correctedGroundTruthClaim", "dangerousSilentOmission", "creditAfter", "09-nine-case-rescore", "08-final-47-case-results"]) {
      expect(body, `bakeoff references ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("§5/§12 — population and probe set are unchanged and structural", () => {
  it("the sealed population is still 163 / 137 after exact dedup", () => {
    const stages = buildDeterministicStages();
    const pop = sealedPopulation();
    const { rehydrated } = rehydrateNodeIds(pop.eligible, stages.index);
    const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
    expect(pop.all).toHaveLength(163);
    expect(keep).toHaveLength(137);
  });

  it("the probe set covers the required axes and is deterministic", () => {
    const a = buildProbeSet();
    const b = buildProbeSet();
    expect(a.map((p) => p.discoveryId)).toEqual(b.map((p) => p.discoveryId));
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(12);
    const axes = new Set(a.map((p) => p.axis));
    for (const required of ["SHORT_SIMPLE_PROHIBITION", "LONGER_COVENANT", "NESTED_SUBSECTION", "THRESHOLD_PROVISION", "CROSS_REFERENCE_HEAVY", "PREVIOUSLY_TIMED_OUT", "PREVIOUSLY_STALLED_AT_CONCURRENCY_6"]) {
      expect(axes.has(required), `probe set missing ${required}`).toBe(true);
    }
  });

  it("probe selection uses execution history and structure, never a benchmark outcome", () => {
    const probes = buildProbeSet();
    for (const p of probes) {
      expect(["COMPLETED", "PROVIDER_FAILURE", "WALL_CLOCK_TIMEOUT", "MODEL_SCHEMA_FAILURE", "NOT_ATTEMPTED", "FAILED"]).toContain(p.priorOutcome);
    }
    // §9 requires at least two prior-timeout candidates.
    expect(probes.filter((p) => p.priorOutcome === "WALL_CLOCK_TIMEOUT").length).toBeGreaterThanOrEqual(2);
  });

  it("no hidden first-N cap over the population", () => {
    const body = src("scripts/p3-conmed-pilot/bakeoff.ts");
    for (const name of ["keep", "rehydrated", "withText"]) {
      expect(body, `${name} is truncated`).not.toMatch(new RegExp(`\\b${name}\\s*\\.\\s*slice\\(\\s*0\\s*,`));
    }
  });
});

describe("§19 — production freeze", () => {
  it("the premium lock and bakeoff live outside production and production does not import them", () => {
    for (const f of ["lib/contract-model/compiler/semantic/caller.ts", "lib/contract-model/compiler/semantic/compile.ts"]) {
      expect(src(f)).not.toMatch(/premium-lock|bakeoff/);
    }
  });

  it("model selection happens through the production env knob, not a code edit", () => {
    expect(src("lib/contract-model/compiler/semantic/caller.ts")).toContain('const MODEL_ENV_VAR = "SEMANTIC_COMPILER_MODEL"');
  });
});
