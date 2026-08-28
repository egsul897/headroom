/**
 * Phase 3C synthetic tests - findings.ts (deterministic-only finding
 * construction from Layer 1 reconciliation output).
 */
import { describe, expect, it } from "vitest";
import { buildFindingsFromReconciliation } from "../../lib/contract-model/compiler/semantic-verification/findings";
import type { ReconciliationResult, VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRRule } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

function compilationResult(overrides: Partial<SemanticCompilationResult> = {}): SemanticCompilationResult {
  return {
    status: "REVIEW_REQUIRED",
    failureReasons: [],
    rules: [],
    definitions: [],
    sharedCapacities: [],
    irExtensionCandidates: [],
    unresolvedIssues: [],
    toolCallLog: [],
    rawModelOutput: {},
    provider: "test",
    model: "test-model",
    telemetry: null,
    cacheKey: "test-cache-key",
    compiledAt: new Date().toISOString(),
    ...overrides,
  };
}

function completeRule(): IRRule {
  return {
    ruleId: "ir-rule:complete-1",
    irSchemaVersion: "v1",
    companyId: "sem-test-co",
    instrumentKey: "sem-test-instrument",
    sourceDocumentId: "sem-test-doc",
    sourceSectionRef: "9.01",
    covenantFamily: "INVESTMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PROHIBITION",
    action: "OTHER",
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
  } as IRRule;
}

describe("Phase 3C - deterministic finding construction from reconciliation", () => {
  it("a NOT_ACCOUNTED_FOR numeric miss becomes a MISSING_BASKET finding, MATERIAL when the candidate has a COMPLETE rule (task §19's stronger scrutiny)", () => {
    const recon: ReconciliationResult = {
      candidateRef: "candidate-1",
      items: [{ classification: "NOT_ACCOUNTED_FOR", sourceItem: { itemId: "s1", kind: "AMOUNT", rawText: "$35,000,000", numericValue: 35_000_000, sourceDocumentId: "doc-1", sourceCitation: "§9.01", structuralNodeKey: null, charStart: 0, charEnd: 10 }, irItems: [], reason: "source AMOUNT 35000000 not found" }],
      materialUnresolvedCount: 1,
    };
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult({ rules: [completeRule()] }) };
    const findings = buildFindingsFromReconciliation(input, recon);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.findingType).toBe("MISSING_BASKET");
    expect(findings[0]?.severity).toBe("MATERIAL");
    expect(findings[0]?.verificationMethod).toBe("DETERMINISTIC_ONLY");
  });

  it("the same NOT_ACCOUNTED_FOR miss is UNCERTAIN (not MATERIAL) when no rule in the candidate claims COMPLETE - the compiler already disclosed uncertainty", () => {
    const recon: ReconciliationResult = {
      candidateRef: "candidate-1",
      items: [{ classification: "NOT_ACCOUNTED_FOR", sourceItem: { itemId: "s1", kind: "AMOUNT", rawText: "$1,000,000", numericValue: 1_000_000, sourceDocumentId: "doc-1", sourceCitation: "§9.01", structuralNodeKey: null, charStart: 0, charEnd: 10 }, irItems: [], reason: "source AMOUNT 1000000 not found" }],
      materialUnresolvedCount: 1,
    };
    const partialRule = { ...completeRule(), sufficiency: "PARTIAL" as const };
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult({ rules: [partialRule] }) };
    const findings = buildFindingsFromReconciliation(input, recon);
    expect(findings[0]?.severity).toBe("UNCERTAIN");
  });

  it("a RATIO miss maps to MISSING_RULE, not MISSING_BASKET", () => {
    const recon: ReconciliationResult = {
      candidateRef: "candidate-1",
      items: [{ classification: "NOT_ACCOUNTED_FOR", sourceItem: { itemId: "s1", kind: "RATIO", rawText: "3.50 to 1.00", numericValue: 3.5, sourceDocumentId: "doc-1", sourceCitation: "§9.01", structuralNodeKey: null, charStart: 0, charEnd: 10 }, irItems: [], reason: "x" }],
      materialUnresolvedCount: 1,
    };
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult({ rules: [completeRule()] }) };
    const findings = buildFindingsFromReconciliation(input, recon);
    expect(findings[0]?.findingType).toBe("MISSING_RULE");
  });

  it("an IR_ONLY figure becomes an UNSUPPORTED_IR_ADDITION finding", () => {
    const recon: ReconciliationResult = {
      candidateRef: "candidate-1",
      items: [{ classification: "IR_ONLY", sourceItem: null, irItems: [{ itemId: "ir1", kind: "AMOUNT", ruleOrDefinitionId: "ir-rule:x", irPath: "rules[0].capacityExpression", numericValue: 99, textValue: null, isAlternativeWithinSelection: false, sourceCitation: null, sourceExcerpt: null }], reason: "fabricated" }],
      materialUnresolvedCount: 1,
    };
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult({ rules: [completeRule()] }) };
    const findings = buildFindingsFromReconciliation(input, recon);
    expect(findings[0]?.findingType).toBe("UNSUPPORTED_IR_ADDITION");
    expect(findings[0]?.ruleOrDefinitionId).toBe("ir-rule:x");
  });

  it("ACCOUNTED_FOR and POSSIBLY_ACCOUNTED_FOR items never produce findings", () => {
    const recon: ReconciliationResult = {
      candidateRef: "candidate-1",
      items: [
        { classification: "ACCOUNTED_FOR", sourceItem: null, irItems: [], reason: "ok" },
        { classification: "POSSIBLY_ACCOUNTED_FOR", sourceItem: null, irItems: [], reason: "low confidence" },
      ],
      materialUnresolvedCount: 0,
    };
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult({ rules: [completeRule()] }) };
    const findings = buildFindingsFromReconciliation(input, recon);
    expect(findings).toHaveLength(0);
  });

  it("stable finding identity: identical reconciliation input produces identical findingIds across two separate calls", () => {
    const recon: ReconciliationResult = {
      candidateRef: "candidate-1",
      items: [{ classification: "NOT_ACCOUNTED_FOR", sourceItem: { itemId: "s1", kind: "AMOUNT", rawText: "$1", numericValue: 1, sourceDocumentId: "doc-1", sourceCitation: "§9.01", structuralNodeKey: null, charStart: 0, charEnd: 1 }, irItems: [], reason: "x" }],
      materialUnresolvedCount: 1,
    };
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult({ rules: [completeRule()] }) };
    const f1 = buildFindingsFromReconciliation(input, recon);
    const f2 = buildFindingsFromReconciliation(input, recon);
    expect(f1.map((f) => f.findingId)).toEqual(f2.map((f) => f.findingId));
  });
});
