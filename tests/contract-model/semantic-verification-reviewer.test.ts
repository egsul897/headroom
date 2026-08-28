/**
 * Phase 3C Layer 2 synthetic tests - reviewer.ts, using a scripted fake
 * StageCaller (no network, no real credential).
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { runAdversarialSemanticReview } from "../../lib/contract-model/compiler/semantic-verification/reviewer";
import { buildVerifierSystemPrompt } from "../../lib/contract-model/compiler/semantic-verification/prompt";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { ReconciliationResult, VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

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

const emptyReconciliation: ReconciliationResult = { candidateRef: "candidate-1", items: [], materialUnresolvedCount: 0 };

describe("Phase 3C Layer 2 - adversarial semantic reviewer", () => {
  it("normalizes a well-formed finding, computing a stable finding ID", async () => {
    const caller = fakeCaller(() => ({ findings: [{ findingType: "MISSING_BASKET", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "$5,000,000 basket", sourceCitation: "§9.01(d)", proposedIrEvidence: "(absent)", reasoning: "the source states a $5,000,000 general basket at clause (d) that has no corresponding compiled rule" }], overallNotes: [] }));
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult() };
    const result = await runAdversarialSemanticReview(input, emptyReconciliation, caller);
    expect(result.failed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.findingType).toBe("MISSING_BASKET");
    expect(result.findings[0]?.severity).toBe("MATERIAL");
    expect(result.findings[0]?.verificationMethod).toBe("SEMANTIC_ONLY");
    expect(result.findings[0]?.verifierReasoning).toMatch(/general basket/);
  });

  it("an empty findings array (no material discrepancy found) is a valid, normal outcome", async () => {
    const caller = fakeCaller(() => ({ findings: [], overallNotes: ["representation appears faithful to source"] }));
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult() };
    const result = await runAdversarialSemanticReview(input, emptyReconciliation, caller);
    expect(result.failed).toBe(false);
    expect(result.findings).toHaveLength(0);
    expect(result.overallNotes).toContain("representation appears faithful to source");
  });

  it("an out-of-vocabulary findingType/severity degrades to a safe fallback rather than crashing (tolerant enum matching)", async () => {
    const caller = fakeCaller(() => ({ findings: [{ findingType: "some_new_thing_the_model_invented", severity: "kinda sure", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "x", sourceCitation: "§9.01", proposedIrEvidence: "y", reasoning: "z" }], overallNotes: [] }));
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult() };
    const result = await runAdversarialSemanticReview(input, emptyReconciliation, caller);
    expect(result.failed).toBe(false);
    expect(result.findings[0]?.findingType).toBe("OTHER_MATERIAL_SEMANTIC_DISCREPANCY");
    expect(result.findings[0]?.severity).toBe("UNCERTAIN");
  });

  it("tolerant enum matching accepts a lowercase/spaced variant via upper-snake-case normalization", async () => {
    const caller = fakeCaller(() => ({ findings: [{ findingType: "wrong amount", severity: "material", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "x", sourceCitation: "§9.01", proposedIrEvidence: "y", reasoning: "z" }], overallNotes: [] }));
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult() };
    const result = await runAdversarialSemanticReview(input, emptyReconciliation, caller);
    expect(result.findings[0]?.findingType).toBe("WRONG_AMOUNT");
    expect(result.findings[0]?.severity).toBe("MATERIAL");
  });

  it("a provider failure is reported honestly (failed:true), never silently swallowed or treated as 'no findings'", async () => {
    const caller = fakeCaller(() => ({}), { throws: true });
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult() };
    const result = await runAdversarialSemanticReview(input, emptyReconciliation, caller);
    expect(result.failed).toBe(true);
    expect(result.failureDetail).toMatch(/simulated provider failure/);
    expect(result.findings).toHaveLength(0);
  });

  it("stable finding identity: identical wire output produces identical findingIds across two separate calls", async () => {
    const scripted = () => ({ findings: [{ findingType: "WRONG_METRIC", severity: "UNCERTAIN", ruleOrDefinitionId: "ir-rule:x", irPath: "rules[0].capacityExpression", sourceEvidence: "x", sourceCitation: "§9.01", proposedIrEvidence: "y", reasoning: "z" }], overallNotes: [] });
    const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult() };
    const r1 = await runAdversarialSemanticReview(input, emptyReconciliation, fakeCaller(scripted));
    const r2 = await runAdversarialSemanticReview(input, emptyReconciliation, fakeCaller(scripted));
    expect(r1.findings.map((f) => f.findingId)).toEqual(r2.findings.map((f) => f.findingId));
  });

  it("the system prompt establishes the reviewer's adversarial posture, the no-answer-key rule, and untrusted-data security - with no package-specific content", () => {
    const prompt = buildVerifierSystemPrompt({ verifierAlgorithmVersion: "test-v1", verifierPromptVersion: "test-prompt-v1" });
    expect(prompt).toMatch(/NOT GIVEN AN ANSWER KEY/i);
    expect(prompt).toMatch(/assume the proposed IR MAY BE WRONG/i);
    expect(prompt).toMatch(/UNTRUSTED CONTRACT EVIDENCE/i);
    expect(prompt.toLowerCase()).not.toMatch(/lsb|fwrg|6\.13|6\.11/);
  });
});
