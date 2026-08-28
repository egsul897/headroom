/**
 * Phase 3F.1.4 (P1-1 remediation) updated this suite's own core assertions
 * below: computeCacheKey (lib/contract-model/compiler/semantic/cache.ts) now
 * includes companyId/instrumentKey/sourceDocumentId, so the scenario this
 * file documents no longer collides. Asserting the leak's continued
 * presence after it has been deliberately fixed would be asserting the
 * wrong thing, not preserving a real safety gate - matching the precedent
 * set by tests/contract-model/architecture-proposal-node-identity.test.ts's
 * own header comment for the same situation. The ORIGINAL adversarial
 * scenario (byte-identical Section 6.01(a) drafting, same candidateRef,
 * same contextBundle.contentIdentity, different companyId) is preserved
 * verbatim below and now proves the FIXED, safe outcome: the model IS
 * invoked for both companies and each gets its own, correct result. New
 * tests were added alongside it for a 3-tenant generalization, a
 * same-tenant positive control (legitimate cache hits still work), and an
 * explicit fail-closed assertion that cache.ts's own key formula really
 * does fold in all three tenant/instrument fields (not just that this one
 * scenario happens to no longer collide).
 *
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

describe("Foundation Audit Job 1 - semantic-compiler default cache cross-tenant leak (invariant #19) - FIXED (P1-1 remediation)", () => {
  it("FIXED: two different companies' byte-identical Section 6.01(a) drafting no longer collide onto the SAME defaultCache entry - Company B's compile genuinely re-invokes the model and gets its own, correct result", async () => {
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
      instrumentKey: "audit-a-cache-tenant-a-instrument",
      sourceDocumentId: "audit-a-cache-tenant-a-doc",
      candidateRef: "6.01(a)", // bare section ref, no document/company scoping of its own
      operativeSourceText: sharedOperativeText,
    });
    const inputB = testCompilerInput({
      companyId: "audit-a-cache-tenant-b",
      instrumentKey: "audit-a-cache-tenant-b-instrument",
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
      // This is deliberately the WORST case for the fix: every field the
      // OLD key formula looked at is byte-identical between A and B: only
      // companyId/instrumentKey/sourceDocumentId (the NEW fields) differ.
    });

    // No `cache` option passed for EITHER call - both use compile.ts's own
    // module-level `defaultCache` singleton, exactly as every current real
    // caller in this repository does.
    const resultA = await compileCovenantToIR(inputA, { caller });
    const resultB = await compileCovenantToIR(inputB, { caller });

    // FIXED: the caller (i.e. the LLM) was invoked ONCE PER COMPANY - Company
    // B's own request genuinely reached the model, it was never served
    // Company A's cached compilation.
    expect(caller.calls).toEqual(["audit-a-cache-tenant-a", "audit-a-cache-tenant-b"]);

    // Company B's result is its OWN result, not Company A's, including a
    // citation string that says so explicitly.
    expect(resultB).not.toBe(resultA); // different object identity: no cross-tenant cache hit.
    expect(resultA.rules[0]!.provenance?.sourceCitation).toContain("audit-a-cache-tenant-a");
    expect(resultB.rules[0]!.provenance?.sourceCitation).toContain("audit-a-cache-tenant-b");
    expect(resultB.rules[0]!.provenance?.sourceCitation).not.toContain("audit-a-cache-tenant-a");
  });

  it("generalized adversarial variant: THREE tenants (not just two), byte-identical drafting across all three, each gets its own real compile call and its own result on the shared defaultCache", async () => {
    const caller = fakeCaller((companyId) => resultFor(companyId));
    const sharedOperativeText = `SECTION 6.01. Payment Conditions. Three-tenant generalization of the adversarial scenario. $100,000,000.`;

    const companies = ["audit-a-cache-3t-alpha", "audit-a-cache-3t-beta", "audit-a-cache-3t-gamma"];
    const results = [];
    for (const companyId of companies) {
      const input = testCompilerInput({ companyId, instrumentKey: `${companyId}-instrument`, sourceDocumentId: `${companyId}-doc`, candidateRef: "6.01(a)", operativeSourceText: sharedOperativeText });
      results.push(await compileCovenantToIR(input, { caller }));
    }

    // Every one of the three tenants genuinely reached the model - none served from another tenant's entry.
    expect(caller.calls).toEqual(companies);
    // Every pairwise result is a distinct object, and each carries only its own company's citation.
    for (let i = 0; i < results.length; i++) {
      for (let j = 0; j < results.length; j++) {
        if (i === j) continue;
        expect(results[i]).not.toBe(results[j]);
      }
      expect(results[i]!.rules[0]!.provenance?.sourceCitation).toContain(companies[i]!);
    }
  });

  it("positive control: the SAME company, SAME instrument, SAME document, byte-identical content genuinely still HITS the cache (the fix must not degrade legitimate same-tenant reuse) - the model is invoked exactly once", async () => {
    const caller = fakeCaller((companyId) => resultFor(companyId));
    const sharedOperativeText = `SECTION 6.02. Positive Control. Same tenant, same everything, repeated call.`;
    const input = testCompilerInput({ companyId: "audit-a-cache-positive-control", instrumentKey: "audit-a-cache-positive-control-instrument", sourceDocumentId: "audit-a-cache-positive-control-doc", candidateRef: "6.02", operativeSourceText: sharedOperativeText });

    const first = await compileCovenantToIR(input, { caller });
    const second = await compileCovenantToIR(input, { caller }); // identical input object, same call pattern every real caller uses (no explicit cache option)

    expect(caller.calls).toEqual(["audit-a-cache-positive-control"]); // model invoked exactly once - the second call is a genuine, legitimate cache hit.
    expect(second).toBe(first); // same object identity: this IS supposed to be a cache hit.
  });

  it("negative control / fail-closed: changing ONLY companyId (identical instrumentKey/sourceDocumentId/candidateRef/text) still produces a cache miss - proves the isolation comes from companyId specifically, not incidentally from instrumentKey or sourceDocumentId also differing in the scenarios above", async () => {
    const caller = fakeCaller((companyId) => resultFor(companyId));
    const sharedOperativeText = `SECTION 6.03. CompanyId-only variation.`;
    const inputA = testCompilerInput({ companyId: "audit-a-cache-companyid-only-a", instrumentKey: "shared-instrument", sourceDocumentId: "shared-doc", candidateRef: "6.03", operativeSourceText: sharedOperativeText });
    const inputB = testCompilerInput({ companyId: "audit-a-cache-companyid-only-b", instrumentKey: "shared-instrument", sourceDocumentId: "shared-doc", candidateRef: "6.03", operativeSourceText: sharedOperativeText });

    const resultA = await compileCovenantToIR(inputA, { caller });
    const resultB = await compileCovenantToIR(inputB, { caller });
    expect(caller.calls).toEqual(["audit-a-cache-companyid-only-a", "audit-a-cache-companyid-only-b"]);
    expect(resultB).not.toBe(resultA);
  });

  it("fail-closed unit assertion on computeCacheKey itself: companyId, instrumentKey, and sourceDocumentId EACH independently change the key when every other field is held fixed", async () => {
    const { computeCacheKey } = await import("../../lib/contract-model/compiler/semantic/cache");
    const base = testCompilerInput({ companyId: "key-co-a", instrumentKey: "key-instr-a", sourceDocumentId: "key-doc-a" });
    const baseKey = computeCacheKey(base, "fake::model");

    const diffCompany = computeCacheKey({ ...base, companyId: "key-co-b" }, "fake::model");
    const diffInstrument = computeCacheKey({ ...base, instrumentKey: "key-instr-b" }, "fake::model");
    const diffDocument = computeCacheKey({ ...base, sourceDocumentId: "key-doc-b" }, "fake::model");
    const identical = computeCacheKey({ ...base }, "fake::model");

    expect(diffCompany).not.toBe(baseKey);
    expect(diffInstrument).not.toBe(baseKey);
    expect(diffDocument).not.toBe(baseKey);
    expect(identical).toBe(baseKey); // fixed-point: no spurious variation when nothing actually changed.
  });

  it("control: the SAME scenario, given an explicit per-call fresh cache (as precedent-integration.ts's own augmented-pass branch already does), ALSO does not leak - this fix does not depend on callers passing their own cache; the shared default is now safe by construction", async () => {
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
