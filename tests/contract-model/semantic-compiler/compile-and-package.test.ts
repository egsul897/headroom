/**
 * Phase 3B synthetic test matrix, part 4 (task §37 item 23 - one rule
 * fails while sibling survives - plus §32/§33 resumability/idempotency
 * and §60 eligibility filtering). Uses a hand-scripted fake SemanticCaller
 * (no network) so compile.ts/package-compile.ts's own orchestration logic
 * is tested in isolation from the tool-use loop itself (already covered
 * in caller-loop.test.ts).
 */
import { describe, expect, it } from "vitest";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { compilePackageToIR, isEligibleForSemanticCompilation } from "../../../lib/contract-model/compiler/semantic/package-compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import type { SemanticCaller, SemanticCallerResult } from "../../../lib/contract-model/compiler/semantic/caller";
import type { DiscoveredCandidate } from "../../../lib/contract-model/compiler/discovery/types";
import { testCompilerInput } from "./test-helpers";

function fakeCaller(compile: (n: number) => SemanticCallerResult): SemanticCaller & { callCount: number } {
  let callCount = 0;
  return {
    providerName: "fake",
    model: "fake-model",
    isSynthetic: false,
    get callCount() {
      return callCount;
    },
    async compile() {
      callCount++;
      return compile(callCount);
    },
  } as SemanticCaller & { callCount: number };
}

function successResult(amount: number): SemanticCallerResult {
  return { submission: { rules: [{ localRef: "r1", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], capacityExpression: { kind: "MONEY", amount }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null }], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }, rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
}

function discoveredCandidate(discoveryId: string, role: DiscoveredCandidate["role"] = "BASKET"): DiscoveredCandidate {
  return {
    discoveryId,
    documentId: "sem-test-doc",
    structuralNodeKeys: [],
    normalizedSourceRef: "9.01",
    families: [],
    role,
    roleRaw: role,
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: [],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test candidate",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: "§9.01",
    discoveryRunVersion: "test-v1",
  } as DiscoveredCandidate;
}

describe("Phase 3B synthetic tests - compile orchestration + package-level batching", () => {
  it("resumability/caching: an identical cache key is served from cache without re-invoking the caller", async () => {
    const cache = new InMemorySemanticCompilationCache();
    const caller = fakeCaller(() => successResult(1_000_000));
    const input = testCompilerInput();
    const first = await compileCovenantToIR(input, { caller, cache });
    const second = await compileCovenantToIR(input, { caller, cache });
    expect(caller.callCount).toBe(1); // second call served from cache, never re-invoked
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(second).toBe(first); // same object identity - a literal cache hit, not a re-derivation that happens to match
  });

  it("idempotency: two DIFFERENT cache entries built from the same wire output produce the same canonical rule content (deterministic normalization)", async () => {
    const cacheA = new InMemorySemanticCompilationCache();
    const cacheB = new InMemorySemanticCompilationCache();
    const callerA = fakeCaller(() => successResult(5_000_000));
    const callerB = fakeCaller(() => successResult(5_000_000));
    const resultA = await compileCovenantToIR(testCompilerInput({ candidateRef: "same-candidate" }), { caller: callerA, cache: cacheA });
    const resultB = await compileCovenantToIR(testCompilerInput({ candidateRef: "same-candidate" }), { caller: callerB, cache: cacheB });
    expect(resultA.rules[0]?.ruleId).toBe(resultB.rules[0]?.ruleId);
    expect(JSON.stringify(resultA.rules[0]?.capacityExpression)).toBe(JSON.stringify(resultB.rules[0]?.capacityExpression));
  });

  it("23 (package-level fault isolation): one candidate's compiler throwing does not prevent its sibling from succeeding", async () => {
    const goodCandidate = discoveredCandidate("good-1");
    const badCandidate = discoveredCandidate("bad-1");
    let calls = 0;
    // One caller shared across both candidates (matching the real orchestrator's own one-caller-per-run convention) - it throws ONLY for the "bad" candidate's own compilerInput, succeeds for the "good" one, proving compilePackageToIR isolates a per-candidate failure rather than aborting the whole batch.
    const mixedCaller: SemanticCaller = {
      providerName: "fake",
      model: "fake-model",
      isSynthetic: false,
      async compile(input) {
        calls++;
        if (input.candidateRef === "bad-1") throw new Error("simulated provider failure");
        return successResult(2_000_000);
      },
    };

    const summary = await compilePackageToIR("sem-test-co", "sem-test-instrument", [
      { candidate: goodCandidate, compilerInput: testCompilerInput({ candidateRef: "good-1" }) },
      { candidate: badCandidate, compilerInput: testCompilerInput({ candidateRef: "bad-1" }) },
    ], { caller: mixedCaller });

    expect(calls).toBe(2); // both were attempted - the failure did not short-circuit the batch
    expect(summary.results).toHaveLength(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    const badEntry = summary.results.find((r) => r.discoveryId === "bad-1")!;
    expect(badEntry.result.unresolvedIssues[0]).toMatch(/simulated provider failure/);
    const goodEntry = summary.results.find((r) => r.discoveryId === "good-1")!;
    expect(goodEntry.result.status).toBe("COMPLETED");
  });

  it("60 (eligibility filtering): a REPRESENTATION-role candidate is skipped, never sent to the compiler", async () => {
    const repCandidate = discoveredCandidate("rep-1", "REPRESENTATION");
    expect(isEligibleForSemanticCompilation(repCandidate).eligible).toBe(false);

    const caller = fakeCaller(() => successResult(1));
    const summary = await compilePackageToIR("sem-test-co", "sem-test-instrument", [{ candidate: repCandidate, compilerInput: testCompilerInput({ candidateRef: "rep-1" }) }], { caller });
    expect(summary.eligibleCount).toBe(0);
    expect(summary.skipped).toHaveLength(1);
    expect(caller.callCount).toBe(0); // never even attempted
  });
});
