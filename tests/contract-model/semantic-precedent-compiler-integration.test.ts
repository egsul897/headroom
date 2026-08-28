/**
 * Phase 3D - conservative compiler integration tests (task §19-§21/§52).
 * Uses a fake SemanticCaller (the same fixture style as
 * tests/contract-model/semantic-compiler's own caller tests) returning a
 * different SubmitCompilationInput per call, so Pass 1 and Pass 2 can be
 * controlled independently and deterministically - zero cost, zero network.
 *
 * Central properties under test: no relevant precedent -> no second model
 * call at all (cost discipline); relevant precedent -> a second call whose
 * prompt-facing context includes a clearly-labeled advisory item; the
 * augmented input's cache identity changes whenever the precedent set
 * changes (task §49); and the mechanical "source always wins" gate
 * discards a Pass 2 result that introduces an ungrounded literal while
 * accepting one that is properly grounded.
 */
import { describe, expect, it } from "vitest";
import { compileCovenantToIRWithPrecedent } from "../../lib/contract-model/compiler/semantic/precedent-integration";
import { testCompilerInput } from "./semantic-compiler/test-helpers";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import type { SubmitCompilationInput } from "../../lib/contract-model/compiler/semantic/wire-schema";
import type { GeneralizedPrecedent, SemanticSignature } from "../../lib/contract-model/compiler/semantic-precedent/types";
import { SEMANTIC_PRECEDENT_SCHEMA_VERSION } from "../../lib/contract-model/compiler/semantic-precedent/types";

function submission(overrides: Partial<SubmitCompilationInput> = {}): SubmitCompilationInput {
  return { rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [], ...overrides };
}

function wireRule(amount: number, localRef = "rule-1") {
  return {
    localRef,
    sourceSectionRef: "6.01",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    capacityExpression: { kind: "MONEY", amount, currency: "USD" },
    conditions: [],
    exceptions: [],
    dependsOn: [],
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    citation: null,
    excerpt: null,
  };
}

class ScriptedCaller implements SemanticCaller {
  providerName = "test-provider";
  model = "test-model";
  isSynthetic = false;
  calls: SemanticCompilerInput[] = [];

  constructor(private readonly responses: SubmitCompilationInput[]) {}

  async compile(input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    this.calls.push(input);
    const submission = this.responses[this.calls.length - 1] ?? this.responses[this.responses.length - 1]!;
    return { submission, rawSubmission: submission, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

function signature(overrides: Partial<SemanticSignature> = {}): SemanticSignature {
  return {
    action: "INCUR_DEBT",
    posture: "PERMISSION",
    ruleType: "QUANTITATIVE_PERMISSION",
    covenantFamily: "INDEBTEDNESS",
    topLevelOperator: "MONEY",
    operatorSet: ["MONEY"],
    hasRatioGate: false,
    hasScheduledThreshold: false,
    hasEventActiveStepUp: false,
    conditionTypes: [],
    hasExceptions: false,
    entityScopeTags: ["BORROWER"],
    hasSharedCapacity: false,
    hasReclassificationDependency: false,
    dependencyRelationshipTypes: [],
    ...overrides,
  };
}

let counter = 0;
function precedent(overrides: Partial<GeneralizedPrecedent> = {}): GeneralizedPrecedent {
  counter++;
  const now = new Date().toISOString();
  return {
    precedentId: `prec-${counter}`,
    version: 1,
    supersedesPrecedentId: null,
    supersededByPrecedentId: null,
    tenancy: "SYSTEM_REVIEWED",
    ownerCompanyId: null,
    dimensions: ["EXPRESSION_SHAPE"],
    granularity: "EXPRESSION_PATTERN",
    lessonDescription: "when a basket states a flat dollar cap, do not also infer a percentage-of-metric alternative unless the source states one",
    signature: signature(),
    expressionPattern: null,
    structuralLessons: ["a trailing proviso attaches to every sibling item in the enumerated list, not just the last one"],
    dependencyLessons: [],
    isNegativePrecedent: false,
    contrastedWithSignature: null,
    reviewStatus: "APPROVED",
    reviewEvents: [],
    support: { supportingInstanceIds: ["inst-1"], distinctSourceDocumentCount: 2, distinctInstrumentCount: 2, distinctCompanyCount: 2, knownCounterexampleInstanceIds: [] },
    origin: "AI_PROPOSED",
    precedentSchemaVersion: SEMANTIC_PRECEDENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("compileCovenantToIRWithPrecedent", () => {
  it("makes only ONE compiler call when no relevant precedent is found (cost discipline)", async () => {
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] })]);
    const input = testCompilerInput({ candidateRef: "cand-no-precedent", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const result = await compileCovenantToIRWithPrecedent(input, [], { caller });
    expect(caller.calls).toHaveLength(1);
    expect(result.precedentAugmented).toBeNull();
    expect(result.precedentRejectedAsUnsupported).toBe(false);
  });

  it("makes a SECOND compiler call, with a clearly-labeled advisory context item, when relevant precedent is found", async () => {
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [wireRule(1_000_000)] })]);
    const input = testCompilerInput({ candidateRef: "cand-second-call", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const result = await compileCovenantToIRWithPrecedent(input, [precedent()], { caller });

    expect(caller.calls).toHaveLength(2);
    const secondCallItems = caller.calls[1]!.contextBundle.items;
    const advisoryItem = secondCallItems.find((i) => i.excerptText.includes("REVIEWED ANALOGICAL EVIDENCE"));
    expect(advisoryItem).toBeDefined();
    expect(advisoryItem!.excerptText).toContain("advisory only");
    expect(advisoryItem!.excerptText).not.toContain(result.baseline.rules[0]!.ruleId); // never leaks internal rule identity into the advisory text
    expect(result.precedentAugmented).not.toBeNull();
  });

  it("the augmented input's contextBundle.contentIdentity differs from the baseline's own, and differs again for a different precedent set (task §49 cache staleness)", async () => {
    const inputA = testCompilerInput({ candidateRef: "cand-cache-identity-a", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const callerA = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [wireRule(1_000_000)] })]);
    await compileCovenantToIRWithPrecedent(inputA, [precedent({ precedentId: "prec-fixed-a" })], { caller: callerA });
    const identityA = callerA.calls[1]!.contextBundle.contentIdentity;

    const inputB = testCompilerInput({ candidateRef: "cand-cache-identity-b", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const callerB = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [wireRule(1_000_000)] })]);
    await compileCovenantToIRWithPrecedent(inputB, [precedent({ precedentId: "prec-fixed-b" })], { caller: callerB });
    const identityB = callerB.calls[1]!.contextBundle.contentIdentity;

    expect(identityA).not.toBe(inputA.contextBundle.contentIdentity);
    expect(identityA).not.toBe(identityB);
  });

  it("source always wins: a Pass 2 amount grounded in the operative source text is accepted", async () => {
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [wireRule(2_000_000, "rule-1")] })]);
    const input = testCompilerInput({ candidateRef: "cand-grounded-amount", operativeSourceText: "Indebtedness not to exceed $1,000,000, or $2,000,000 in the case of a Qualified IPO." });
    const result = await compileCovenantToIRWithPrecedent(input, [precedent()], { caller });
    expect(result.precedentRejectedAsUnsupported).toBe(false);
    expect(result.precedentAugmented).not.toBeNull();
  });

  it("source always wins: a Pass 2 amount NOT grounded in Pass 1 or the source text is rejected wholesale, falling back to baseline", async () => {
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [wireRule(35_000_000, "rule-1")] })]);
    const input = testCompilerInput({ candidateRef: "cand-ungrounded-amount", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const result = await compileCovenantToIRWithPrecedent(input, [precedent()], { caller });
    expect(result.precedentRejectedAsUnsupported).toBe(true);
    expect(result.precedentAugmented).toBeNull();
    expect(result.baseline.rules[0]?.capacityExpression).toMatchObject({ kind: "MONEY", amount: 1_000_000 });
  });

  it("source always wins: a Pass 2 action/posture change relative to Pass 1's own baseline is rejected wholesale, even with no numeric change at all (task §21 correlation-risk motivation - see the verifier-integration-decision test for the fuller argument)", async () => {
    const corruptedActionRule = { ...wireRule(1_000_000), action: "OTHER", posture: "N_A" };
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [corruptedActionRule] })]);
    const input = testCompilerInput({ candidateRef: "cand-corrupted-action", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const result = await compileCovenantToIRWithPrecedent(input, [precedent()], { caller });
    expect(result.precedentRejectedAsUnsupported).toBe(true);
    expect(result.precedentAugmented).toBeNull();
    expect(result.baseline.rules[0]?.action).toBe("INCUR_DEBT");
  });

  it("a Pass 2 percentage grounded in the source text (as a %, not a fraction) is accepted", async () => {
    const percentRule = { ...wireRule(0, "rule-1"), capacityExpression: { kind: "PERCENT", value: 0.125 } };
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [percentRule] })]);
    const input = testCompilerInput({ candidateRef: "cand-grounded-percent", operativeSourceText: "Indebtedness not to exceed 12.5% of Consolidated EBITDA." });
    const result = await compileCovenantToIRWithPrecedent(input, [precedent()], { caller });
    expect(result.precedentRejectedAsUnsupported).toBe(false);
  });

  it("returns every retrieval match considered, even when the advisory threshold is not cleared", async () => {
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] })]);
    const weakPrecedent = precedent({ signature: signature({ action: "OTHER", posture: "OBLIGATION", topLevelOperator: null, operatorSet: [], entityScopeTags: [] }) });
    const input = testCompilerInput({ candidateRef: "cand-weak-precedent", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const result = await compileCovenantToIRWithPrecedent(input, [weakPrecedent], { caller });
    expect(result.precedentMatches.length).toBeGreaterThan(0);
    expect(result.precedentAugmented).toBeNull();
  });
});
