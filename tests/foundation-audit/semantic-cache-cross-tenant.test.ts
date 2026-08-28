/**
 * Phase 3F.1.3 - Foundation Assurance Audit, Job 1: cross-tenant leakage
 * through lib/contract-model/compiler/semantic/compile.ts's DEFAULT cache.
 *
 * REAL FINDING under test: compile.ts declares a single MODULE-LEVEL
 * singleton (`const defaultCache = new InMemorySemanticCompilationCache()`,
 * compile.ts:23) used whenever a caller omits `options.cache`. Its cache
 * key (cache.ts's computeCacheKey) is built from
 * [candidateRef, operativeSourceText, contextBundle.contentIdentity,
 * operativeLineage fields, irSchemaVersion, compilerAlgorithmVersion,
 * compilerPromptVersion, toolPolicyVersion, providerIdentity] - it NEVER
 * includes companyId, instrumentKey, or sourceDocumentId. Every one of
 * SemanticCompilerInput's own tenant-identifying fields is excluded from
 * the one thing that decides whether a second company's request is served
 * from a first company's cached result.
 *
 * This is not hypothetical: every real current caller of
 * compileCovenantToIR/compilePackageToIR in this repository
 * (lib/contract-model/compiler/semantic/precedent-integration.ts:217,
 * scripts/phase-3b-real-regression.ts, scripts/phase-3f-first-blind-run.ts,
 * scripts/phase-3f1-1-final-artifacts.ts) omits `options.cache`, so every
 * one of those already runs against this exact shared, unbounded,
 * process-lifetime, tenant-blind singleton - and scripts/run-phase-c-compiler.ts's
 * sibling script (companyId "fixture-fwrg-2021-credit-agreement-co" and
 * "fixture-lsb-2023-abl-credit-agreement-co") shows the real regression
 * harness already processes MULTIPLE companies within a single Node
 * process invocation, which is exactly the condition under which this
 * defect activates.
 *
 * This test constructs the exact adversarial scenario the audit specifies
 * (identical Section 6.01(a) drafting, identical defined term, identical
 * $100,000,000 threshold) as two different companies' SemanticCompilerInput
 * objects and proves, with a real (non-cached) fake LLM caller, that
 * Company B's compile call is served Company A's cached result WITHOUT
 * ever invoking the model for Company B.
 */
import { describe, expect, it } from "vitest";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import { testCompilerInput } from "../contract-model/semantic-compiler/test-helpers";

function fakeCaller(compile: (companyIdSeen: string) => SemanticCallerResult): SemanticCaller & { calls: string[] } {
  const calls: string[] = [];
  return {
    providerName: "fake-audit",
    model: "fake-audit-model",
    isSynthetic: false,
    calls,
    async compile(input) {
      calls.push(input.companyId);
      return compile(input.companyId);
    },
  } as SemanticCaller & { calls: string[] };
}

function resultFor(companyId: string): SemanticCallerResult {
  return {
    submission: {
      rules: [
        {
          localRef: "r1",
          sourceSectionRef: "6.01(a)",
          covenantFamily: "RESTRICTED_PAYMENTS",
          ruleType: "QUANTITATIVE_PERMISSION",
          posture: "PERMISSION",
          action: "RESTRICTED_PAYMENT",
          entityScope: [],
          entityScopeExcluded: [],
          capacityExpression: { kind: "MONEY", amount: 100_000_000 },
          conditions: [],
          exceptions: [],
          dependsOn: [],
          sufficiency: "COMPLETE",
          sufficiencyReasons: [],
          citation: `real citation belonging to ${companyId}'s own document`,
          excerpt: null,
        },
      ],
      definitions: [],
      sharedCapacities: [],
      irExtensionCandidates: [],
      overallNotes: [`compiled for ${companyId}`],
    },
    rawSubmission: {},
    toolCallLog: [],
    telemetry: null,
    failureReason: null,
    failureDetail: null,
  };
}

describe("Foundation Audit Job 1 - semantic-compiler default cache cross-tenant leak (invariant #19)", () => {
  it("P0/P1 REAL FINDING: two different companies' byte-identical Section 6.01(a) drafting collide onto the SAME defaultCache entry - Company B's compile is served Company A's cached result and the caller is never invoked for Company B", async () => {
    const caller = fakeCaller((companyId) => resultFor(companyId));

    // Identical drafting for two DIFFERENT companies (the exact adversarial
    // scenario: Section 6.01(a), "Payment Conditions", $100,000,000),
    // deliberately using the SAME candidateRef/operativeSourceText/
    // contextBundle.contentIdentity a bare-section-ref (no DiscoveredCandidate)
    // caller would legitimately produce - candidateRef "falls back to the
    // normalized source section ref" per SemanticCompilerInput's own doc
    // comment (semantic/types.ts:95) whenever no discovery candidate exists.
    const sharedOperativeText =
      `SECTION 6.01. Payment Conditions. The Company shall not make any Restricted Payment unless: ` +
      `(a) the aggregate amount does not exceed $100,000,000. "Payment Conditions" means the conditions set forth in this Section 6.01.`;

    const inputA = testCompilerInput({
      companyId: "audit-a-cache-tenant-a",
      sourceDocumentId: "audit-a-cache-tenant-a-doc",
      candidateRef: "6.01(a)", // bare section ref, no document/company scoping of its own
      operativeSourceText: sharedOperativeText,
    });
    const inputB = testCompilerInput({
      companyId: "audit-a-cache-tenant-b",
      sourceDocumentId: "audit-a-cache-tenant-b-doc",
      candidateRef: "6.01(a)", // identical bare ref - a different company's own document, independently drafted
      operativeSourceText: sharedOperativeText,
      // contextBundle deliberately left at its default (contentIdentity:
      // "content-1") for BOTH companies - the fixture helper's default,
      // matching how a trivial/self-contained covenant with no
      // cross-references or definitions dependency (empty readSpans) would
      // legitimately produce a contentIdentity that does not vary by
      // company (see lib/contract-model/compiler/context-retrieval/identity.ts's
      // computeContentIdentity - it is not a company-scoped hash by design).
    });

    // No `cache` option passed for EITHER call - both use compile.ts's own
    // module-level `defaultCache` singleton, exactly as every current real
    // caller in this repository does.
    const resultA = await compileCovenantToIR(inputA, { caller });
    const resultB = await compileCovenantToIR(inputB, { caller });

    // The actual defect, reproduced: the caller (i.e. the LLM) was invoked
    // exactly ONCE, for Company A. Company B's own request never reached
    // the model at all - it was served Company A's cached compilation.
    expect(caller.calls).toEqual(["audit-a-cache-tenant-a"]);

    // Company B's "own" result is, byte-for-byte, Company A's result -
    // including a citation string that says so explicitly.
    expect(resultB).toBe(resultA); // same object identity: a literal cross-tenant cache hit.
    expect(resultB.rules[0]!.provenance?.sourceCitation).toContain("audit-a-cache-tenant-a");
    expect(resultB.rules[0]!.provenance?.sourceCitation).not.toContain("audit-a-cache-tenant-b");
  });

  it("control: the SAME scenario, given an explicit per-call fresh cache (as precedent-integration.ts's own augmented-pass branch already does), does NOT leak - proving the fix is 'always pass a real cache', not a change this audit is making to production code", async () => {
    const caller = fakeCaller((companyId) => resultFor(companyId));
    const sharedOperativeText = `SECTION 9.01. Control Scenario. Identical text used only to prove the isolated-cache control case.`;
    const inputA = testCompilerInput({ companyId: "audit-a-cache-control-a", candidateRef: "9.01", operativeSourceText: sharedOperativeText });
    const inputB = testCompilerInput({ companyId: "audit-a-cache-control-b", candidateRef: "9.01", operativeSourceText: sharedOperativeText });

    const { InMemorySemanticCompilationCache } = await import("../../lib/contract-model/compiler/semantic/cache");
    const resultA = await compileCovenantToIR(inputA, { caller, cache: new InMemorySemanticCompilationCache() });
    const resultB = await compileCovenantToIR(inputB, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(caller.calls).toEqual(["audit-a-cache-control-a", "audit-a-cache-control-b"]);
    expect(resultB).not.toBe(resultA);
    expect(resultB.rules[0]!.provenance?.sourceCitation).toContain("audit-a-cache-control-b");
  });
});
