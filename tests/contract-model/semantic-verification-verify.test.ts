/**
 * Phase 3C synthetic tests - verify.ts (top-level orchestration: routing,
 * merging, status/trust gating).
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRRule } from "../../lib/contract-model/ir/types";
import { testCompilerInput, emptyContextBundle } from "./semantic-compiler/test-helpers";

function fakeCaller(response: () => unknown, opts: { throws?: boolean } = {}): StageCaller {
  return {
    providerName: "test-provider",
    model: "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      if (opts.throws) throw new Error("simulated provider failure");
      return schema.parse(response());
    },
    lastTelemetry: () => null,
  };
}

function compilationResult(overrides: Partial<SemanticCompilationResult> = {}): SemanticCompilationResult {
  return { status: "REVIEW_REQUIRED", failureReasons: [], errorDetail: null, rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(), ...overrides };
}

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:test-${ruleCounter}`,
    irSchemaVersion: "v1",
    companyId: "sem-test-co",
    instrumentKey: "sem-test-instrument",
    sourceDocumentId: "sem-test-doc",
    sourceSectionRef: "9.01",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: "v1",
    sourceContentVersion: null,
    ...overrides,
  } as IRRule;
}

const emptyFindingsResponse = () => ({ findings: [], overallNotes: [] });

describe("Phase 3C - top-level verify orchestration", () => {
  it("a straightforward, fully-reconciled single fixed basket SKIPS semantic review (task §32 conservative routing) and is VERIFIED_NO_MATERIAL_GAP_FOUND", async () => {
    const text = "The Company may incur Indebtedness in an amount not to exceed $5,000,000.";
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 5_000_000, currency: "USD" } });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
    const result = await verifyCompiledCandidate(input, { reviewCaller: fakeCaller(() => { throw new Error("must not be called"); }) });
    expect(result.semanticReviewInvoked).toBe(false);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });

  it("a genuine numeric gap (MATERIAL, COMPLETE rule) routes to semantic review and produces MATERIAL_DISCREPANCY status", async () => {
    const text = "The Company may incur Indebtedness in an amount not to exceed $5,000,000.";
    const r = rule({ capacityExpression: null, sufficiency: "COMPLETE" }); // claims COMPLETE but represents nothing
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
    const caller = fakeCaller(() => ({ findings: [{ findingType: "MISSING_BASKET", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "$5,000,000", sourceCitation: "§9.01", proposedIrEvidence: "(absent)", reasoning: "confirmed missing" }], overallNotes: [] }));
    const result = await verifyCompiledCandidate(input, { reviewCaller: caller });
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("a matching deterministic finding and semantic finding on the same rule/findingType MERGE into one BOTH finding (task §31)", async () => {
    const text = "The Company may incur Indebtedness in an amount not to exceed $5,000,000.";
    const r = rule({ capacityExpression: null, sufficiency: "COMPLETE" });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
    const caller = fakeCaller(() => ({ findings: [{ findingType: "MISSING_BASKET", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "$5,000,000", sourceCitation: "§9.01", proposedIrEvidence: "(absent)", reasoning: "confirmed" }], overallNotes: [] }));
    const result = await verifyCompiledCandidate(input, { reviewCaller: caller });
    const missingBasketFindings = result.findings.filter((f) => f.findingType === "MISSING_BASKET");
    expect(missingBasketFindings).toHaveLength(1);
    expect(missingBasketFindings[0]?.verificationMethod).toBe("BOTH");
  });

  it("incomplete context bundle sufficiency produces VERIFICATION_INCOMPLETE even with no findings", async () => {
    const bundle = emptyContextBundle({ sufficiencyState: "INCOMPLETE" });
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 1, currency: "USD" } });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: "not to exceed $1.", contextBundle: bundle }), compilationResult: compilationResult({ rules: [r] }) };
    const result = await verifyCompiledCandidate(input, { reviewCaller: fakeCaller(emptyFindingsResponse) });
    expect(result.status).toBe("VERIFICATION_INCOMPLETE");
  });

  it("a CONFLICTED operative lineage never allows VERIFIED_NO_MATERIAL_GAP_FOUND even when no finding exists (task §18)", async () => {
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 1, currency: "USD" } });
    const input: VerificationInput = {
      compilerInput: testCompilerInput({ operativeSourceText: "not to exceed $1.", operativeLineage: { instrumentKey: "i", provisionKey: "p", asOfDate: "2026-01-01", operativeStatus: "OPERATIVE_STATE_CONFLICTED", currentSourceDocumentId: "doc-1" } }),
      compilationResult: compilationResult({ rules: [r] }),
    };
    const result = await verifyCompiledCandidate(input, { reviewCaller: fakeCaller(emptyFindingsResponse) });
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("a semantic review provider failure (when semantic review was actually needed) produces VERIFICATION_FAILED, never a false 'no gap found'", async () => {
    const r = rule({ capacityExpression: null, sufficiency: "COMPLETE" });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: "not to exceed $5,000,000." }), compilationResult: compilationResult({ rules: [r] }) };
    const result = await verifyCompiledCandidate(input, { reviewCaller: fakeCaller(() => ({}), { throws: true }) });
    expect(result.status).toBe("VERIFICATION_FAILED");
  });

  it("a real UNCERTAIN-only outcome (semantic review runs, finds only a low-confidence issue) produces REVIEW_REQUIRED, never a clean pass", async () => {
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 1, currency: "USD" }, dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "ir-rule:other", description: "x" }] });
    const def = { definitionId: "ir-def:1", irSchemaVersion: "v1", companyId: "c", instrumentKey: "i", sourceDocumentId: "d", termName: "Some Term", covenantFamily: "DEFINITIONS_CALCULATION_RULES" as const, calculationExpression: null, dependsOnTerms: [], sufficiency: "COMPLETE" as const, sufficiencyReasons: [], provenance: null, compilerVersion: "v1", sourceContentVersion: null };
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: "not to exceed $1." }), compilationResult: compilationResult({ rules: [r], definitions: [def] }) };
    const caller = fakeCaller(() => ({ findings: [{ findingType: "OTHER_MATERIAL_SEMANTIC_DISCREPANCY", severity: "UNCERTAIN", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "x", sourceCitation: "§9.01", proposedIrEvidence: "y", reasoning: "not fully resolvable from available evidence" }], overallNotes: [] }));
    const result = await verifyCompiledCandidate(input, { reviewCaller: caller });
    expect(result.semanticReviewInvoked).toBe(true); // 2 units -> routed to review regardless of reconciliation
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("compiler output (the IRRule objects) is never mutated by verification", async () => {
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 5_000_000, currency: "USD" } });
    const frozenSnapshot = JSON.stringify(r);
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: "not to exceed $5,000,000." }), compilationResult: compilationResult({ rules: [r] }) };
    await verifyCompiledCandidate(input, { reviewCaller: fakeCaller(() => { throw new Error("should not be called"); }) });
    expect(JSON.stringify(r)).toBe(frozenSnapshot);
  });
});
