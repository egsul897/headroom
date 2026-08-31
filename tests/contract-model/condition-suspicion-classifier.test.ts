/**
 * Phase 3F.1-terminal Architecture Decision, Part A - unit coverage for
 * condition-suspicion-classifier.ts itself (the second, semantic routing
 * gate) and for verify.ts's two-gate orchestration around it. See
 * docs/phase-3f1-terminal-architecture-decision/02-architecture-decision.json
 * for the mandated design and
 * docs/phase-3f1-terminal-architecture-decision/06-condition-suspicion-architecture.json
 * for the full deliverable write-up, including the honest disclosure that
 * no real AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY was available in this
 * environment - every test below uses a SCRIPTED fake caller (this
 * codebase's own established "scripted-semantic tier" convention, e.g.
 * tests/contract-model/semantic-verification-fault-injection.test.ts's own
 * fakeCaller) to prove the ORCHESTRATION is correct; it is not, and cannot
 * be, a claim that a real model reliably classifies any particular
 * sentence correctly - that requires real-model validation, which this
 * phase's own deliverable explicitly defers to Part B recertification.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import {
  classifyConditionSuspicion,
  computeConditionSuspicionCacheKey,
  InMemoryConditionSuspicionCache,
  type ConditionSuspicionCache,
} from "../../lib/contract-model/compiler/semantic-verification/condition-suspicion-classifier";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

function scriptedCaller(response: () => unknown, opts: { throws?: boolean; providerName?: string; model?: string } = {}): StageCaller {
  let calls = 0;
  return {
    providerName: opts.providerName ?? "test-provider",
    model: opts.model ?? "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      calls++;
      if (opts.throws) throw new Error("simulated transport failure");
      return schema.parse(response());
    },
    lastTelemetry: (): AnalyzerCallTelemetry | null => null,
    get callCount() {
      return calls;
    },
  } as StageCaller & { callCount: number };
}

const IDENTITY = { companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" };

describe("condition-suspicion-classifier - basic status normalization", () => {
  it("a scripted NO_MATERIAL_CONDITION_SUSPECTED response round-trips cleanly", async () => {
    const caller = scriptedCaller(() => ({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }));
    const result = await classifyConditionSuspicion("The Company shall deliver quarterly financial statements.", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.status).toBe("NO_MATERIAL_CONDITION_SUSPECTED");
    expect(result.evidence).toHaveLength(0);
    expect(result.failed).toBe(false);
    expect(result.isSynthetic).toBe(false);
    expect(result.fromCache).toBe(false);
  });

  it("a scripted MATERIAL_CONDITION_POSSIBLE response carries through evidence with a valid category", async () => {
    const caller = scriptedCaller(() => ({
      status: "MATERIAL_CONDITION_POSSIBLE",
      evidence: [{ sourceSpan: "Should a Change of Control occur", description: "the whole obligation is conditioned on this event", category: "EVENT_DEPENDENCY" }],
    }));
    const result = await classifyConditionSuspicion("Should a Change of Control occur, the Company shall repurchase the Notes.", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.status).toBe("MATERIAL_CONDITION_POSSIBLE");
    expect(result.evidence).toEqual([{ sourceSpan: "Should a Change of Control occur", description: "the whole obligation is conditioned on this event", category: "EVENT_DEPENDENCY" }]);
  });

  it("an UNCERTAIN response round-trips cleanly", async () => {
    const caller = scriptedCaller(() => ({ status: "UNCERTAIN", evidence: [] }));
    const result = await classifyConditionSuspicion("Some ambiguous excerpt.", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.status).toBe("UNCERTAIN");
  });

  it("an out-of-vocabulary status string falls back to the conservative UNCERTAIN, never a silent NO_MATERIAL_CONDITION_SUSPECTED", async () => {
    const caller = scriptedCaller(() => ({ status: "TOTALLY_MADE_UP_STATUS", evidence: [] }));
    const result = await classifyConditionSuspicion("text", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.status).toBe("UNCERTAIN");
  });

  it("an out-of-vocabulary evidence category falls back to OTHER_CONDITIONAL_DEPENDENCY rather than being dropped or crashing", async () => {
    const caller = scriptedCaller(() => ({ status: "MATERIAL_CONDITION_POSSIBLE", evidence: [{ sourceSpan: "x", description: "y", category: "SOME_NEW_CATEGORY_THE_MODEL_INVENTED" }] }));
    const result = await classifyConditionSuspicion("text", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.evidence[0]?.category).toBe("OTHER_CONDITIONAL_DEPENDENCY");
  });

  it("a lower/mixed-case status string is tolerantly normalized (upper-snake-case matching)", async () => {
    const caller = scriptedCaller(() => ({ status: "material condition possible", evidence: [] }));
    const result = await classifyConditionSuspicion("text", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.status).toBe("MATERIAL_CONDITION_POSSIBLE");
  });
});

describe("condition-suspicion-classifier - failure handling (network error/timeout simulation)", () => {
  it("a thrown transport error is caught and converted to UNCERTAIN + failed:true, never propagated as an uncaught exception", async () => {
    const caller = scriptedCaller(() => ({}), { throws: true });
    const result = await classifyConditionSuspicion("text", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.status).toBe("UNCERTAIN");
    expect(result.failed).toBe(true);
    expect(result.failureDetail).toContain("simulated transport failure");
    expect(result.evidence).toHaveLength(0);
  });

  it("a malformed/schema-violating response (missing required status) is caught the same way", async () => {
    const caller = scriptedCaller(() => ({ evidence: [] })); // no `status` field at all
    const result = await classifyConditionSuspicion("text", IDENTITY, caller, new InMemoryConditionSuspicionCache());
    expect(result.status).toBe("UNCERTAIN");
    expect(result.failed).toBe(true);
  });

  it("a failed classification is NEVER cached - a retried call for the identical span gets a fresh real attempt, not a stuck failure", async () => {
    const cache = new InMemoryConditionSuspicionCache();
    let attempt = 0;
    const caller: StageCaller = {
      providerName: "test-provider",
      model: "test-model",
      isSynthetic: false,
      async call<T>(schema: ZodType<T>): Promise<T> {
        attempt++;
        if (attempt === 1) throw new Error("transient");
        return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      },
      lastTelemetry: () => null,
    };
    const first = await classifyConditionSuspicion("text", IDENTITY, caller, cache);
    expect(first.failed).toBe(true);
    const second = await classifyConditionSuspicion("text", IDENTITY, caller, cache);
    expect(second.failed).toBe(false);
    expect(second.status).toBe("NO_MATERIAL_CONDITION_SUSPECTED");
    expect(attempt).toBe(2); // both calls actually reached the caller - the failure was not cached
  });
});

describe("condition-suspicion-classifier - caching behavior", () => {
  it("the same span + identity + version does NOT re-call the model a second time", async () => {
    const cache = new InMemoryConditionSuspicionCache();
    const caller = scriptedCaller(() => ({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] })) as StageCaller & { callCount: number };
    const first = await classifyConditionSuspicion("identical source text", IDENTITY, caller, cache);
    const second = await classifyConditionSuspicion("identical source text", IDENTITY, caller, cache);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(caller.callCount).toBe(1);
  });

  it("a different source span (even by one character) is a cache miss", async () => {
    const cache = new InMemoryConditionSuspicionCache();
    const caller = scriptedCaller(() => ({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] })) as StageCaller & { callCount: number };
    await classifyConditionSuspicion("source text A", IDENTITY, caller, cache);
    await classifyConditionSuspicion("source text B", IDENTITY, caller, cache);
    expect(caller.callCount).toBe(2);
  });

  it("computeConditionSuspicionCacheKey is a pure, deterministic function of its inputs", () => {
    const k1 = computeConditionSuspicionCacheKey(IDENTITY, "some text", "anthropic::claude-x");
    const k2 = computeConditionSuspicionCacheKey(IDENTITY, "some text", "anthropic::claude-x");
    expect(k1).toBe(k2);
  });

  it("a different provider/model identity produces a different cache key even for identical text+tenant", () => {
    const k1 = computeConditionSuspicionCacheKey(IDENTITY, "some text", "anthropic::claude-x");
    const k2 = computeConditionSuspicionCacheKey(IDENTITY, "some text", "anthropic::claude-y");
    expect(k1).not.toBe(k2);
  });
});

describe("condition-suspicion-classifier - tenant isolation (zero cross-tenant leakage)", () => {
  it("two different companyIds with byte-identical source text and instrument/document identity never share a cache entry", async () => {
    const cache = new InMemoryConditionSuspicionCache();
    const callerA = scriptedCaller(() => ({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] })) as StageCaller & { callCount: number };
    const callerB = scriptedCaller(() => ({ status: "MATERIAL_CONDITION_POSSIBLE", evidence: [{ sourceSpan: "x", description: "y", category: "OTHER_CONDITIONAL_DEPENDENCY" }] })) as StageCaller & { callCount: number };

    const resultA = await classifyConditionSuspicion("byte-identical boilerplate text", { companyId: "tenant-A", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }, callerA, cache);
    const resultB = await classifyConditionSuspicion("byte-identical boilerplate text", { companyId: "tenant-B", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }, callerB, cache);

    expect(resultA.fromCache).toBe(false);
    expect(resultB.fromCache).toBe(false); // NOT served tenant-A's cached entry
    expect(resultA.status).toBe("NO_MATERIAL_CONDITION_SUSPECTED");
    expect(resultB.status).toBe("MATERIAL_CONDITION_POSSIBLE"); // tenant B's own real answer, not tenant A's
    expect(callerA.callCount).toBe(1);
    expect(callerB.callCount).toBe(1);
  });

  it("a different instrumentKey for the SAME companyId also misses the cache (full tenant/instrument/document tuple, not companyId alone)", async () => {
    const cache = new InMemoryConditionSuspicionCache();
    const caller = scriptedCaller(() => ({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] })) as StageCaller & { callCount: number };
    await classifyConditionSuspicion("same text", { companyId: "co-1", instrumentKey: "inst-A", sourceDocumentId: "doc-1" }, caller, cache);
    await classifyConditionSuspicion("same text", { companyId: "co-1", instrumentKey: "inst-B", sourceDocumentId: "doc-1" }, caller, cache);
    expect(caller.callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// verify.ts's two-gate orchestration around the classifier.
// ---------------------------------------------------------------------------

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:csc-${ruleCounter}`,
    irSchemaVersion: "v1",
    companyId: "co-1",
    instrumentKey: "inst-1",
    sourceDocumentId: "doc-1",
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
function compilationResult(overrides: Partial<SemanticCompilationResult> = {}): SemanticCompilationResult {
  return { status: "REVIEW_REQUIRED", failureReasons: [], errorDetail: null, rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(), ...overrides };
}
function money(amount: number): IRExpression {
  return { exprId: "e", kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}

describe("verify.ts two-gate routing - the classifier's own routing contract", () => {
  it("deterministic-clean + classifier NO_MATERIAL_CONDITION_SUSPECTED -> skip Layer 2 entirely", async () => {
    const text = "The Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: money(2_000_000) });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    const reviewCaller = scriptedCaller(() => { throw new Error("Layer 2 must not be called"); });
    const conditionSuspicionCaller = scriptedCaller(() => ({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }));
    const result = await verifyCompiledCandidate(input, { reviewCaller, conditionSuspicionCaller, conditionSuspicionCache: new InMemoryConditionSuspicionCache() });
    expect(result.semanticReviewInvoked).toBe(false);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.conditionSuspicion?.status).toBe("NO_MATERIAL_CONDITION_SUSPECTED");
  });

  it("deterministic-clean + classifier MATERIAL_CONDITION_POSSIBLE -> forces Layer 2 review", async () => {
    const text = "Should a Change of Control occur, the Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: money(2_000_000), conditions: [] });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    const reviewCaller = scriptedCaller(() => ({ findings: [{ findingType: "MISSING_CONDITION", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "Should a Change of Control occur", proposedIrEvidence: "conditions=[]", reasoning: "the event-dependency is entirely dropped" }], overallNotes: [] })) as StageCaller & { callCount: number };
    const conditionSuspicionCaller = scriptedCaller(() => ({ status: "MATERIAL_CONDITION_POSSIBLE", evidence: [{ sourceSpan: "Should a Change of Control occur", description: "event-dependency", category: "EVENT_DEPENDENCY" }] }));
    const result = await verifyCompiledCandidate(input, { reviewCaller, conditionSuspicionCaller, conditionSuspicionCache: new InMemoryConditionSuspicionCache() });
    expect(result.semanticReviewInvoked).toBe(true);
    expect(reviewCaller.callCount).toBe(1);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.conditionSuspicion?.status).toBe("MATERIAL_CONDITION_POSSIBLE");
  });

  it("deterministic-clean + classifier UNCERTAIN -> forces Layer 2 review (never treated as a clean skip)", async () => {
    const text = "An ambiguous excerpt that a classifier might not fully resolve. The Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: money(2_000_000) });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    const reviewCaller = scriptedCaller(() => ({ findings: [], overallNotes: ["reviewed, nothing wrong"] })) as StageCaller & { callCount: number };
    const conditionSuspicionCaller = scriptedCaller(() => ({ status: "UNCERTAIN", evidence: [] }));
    const result = await verifyCompiledCandidate(input, { reviewCaller, conditionSuspicionCaller, conditionSuspicionCache: new InMemoryConditionSuspicionCache() });
    expect(result.semanticReviewInvoked).toBe(true);
    expect(reviewCaller.callCount).toBe(1);
    expect(result.conditionSuspicion?.status).toBe("UNCERTAIN");
  });

  it("classifier call failure (simulated network error) ALWAYS routes to review, never silently skips it", async () => {
    const text = "The Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: money(2_000_000) });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    const reviewCaller = scriptedCaller(() => ({ findings: [], overallNotes: [] })) as StageCaller & { callCount: number };
    const conditionSuspicionCaller = scriptedCaller(() => ({}), { throws: true });
    const result = await verifyCompiledCandidate(input, { reviewCaller, conditionSuspicionCaller, conditionSuspicionCache: new InMemoryConditionSuspicionCache() });
    expect(result.conditionSuspicion?.failed).toBe(true);
    expect(result.conditionSuspicion?.status).toBe("UNCERTAIN");
    expect(result.semanticReviewInvoked).toBe(true);
    expect(reviewCaller.callCount).toBe(1);
  });

  it("cost discipline: when DETERMINISTIC evidence already forces review, the classifier is never called at all", async () => {
    const text = "The Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: null, sufficiency: "COMPLETE" }); // claims COMPLETE but represents nothing -> NOT_ACCOUNTED_FOR -> materialUnresolvedCount > 0
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    const reviewCaller = scriptedCaller(() => ({ findings: [], overallNotes: [] })) as StageCaller & { callCount: number };
    const conditionSuspicionCaller = scriptedCaller(() => { throw new Error("classifier must NEVER be called when deterministic evidence already forces review"); }) as StageCaller & { callCount: number };
    const result = await verifyCompiledCandidate(input, { reviewCaller, conditionSuspicionCaller });
    expect(result.semanticReviewInvoked).toBe(true);
    expect(conditionSuspicionCaller.callCount).toBe(0);
    expect(result.conditionSuspicion).toBeNull();
  });

  it("cost discipline: forceSemanticReview bypasses the classifier entirely (no wasted spend when the caller already decided)", async () => {
    const text = "The Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: money(2_000_000) });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    const reviewCaller = scriptedCaller(() => ({ findings: [], overallNotes: [] })) as StageCaller & { callCount: number };
    const conditionSuspicionCaller = scriptedCaller(() => { throw new Error("must not be called"); }) as StageCaller & { callCount: number };
    const result = await verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller, conditionSuspicionCaller });
    expect(result.semanticReviewInvoked).toBe(true);
    expect(conditionSuspicionCaller.callCount).toBe(0);
  });

  it("cost discipline: skipSemanticReview bypasses the classifier entirely (zero-cost deterministic-only preview path)", async () => {
    const text = "Should a Change of Control occur, the Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: money(2_000_000), conditions: [] });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    const conditionSuspicionCaller = scriptedCaller(() => { throw new Error("must not be called"); }) as StageCaller & { callCount: number };
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true, conditionSuspicionCaller });
    expect(result.semanticReviewInvoked).toBe(false);
    expect(conditionSuspicionCaller.callCount).toBe(0);
    expect(result.conditionSuspicion).toBeNull();
  });

  it("cost discipline end-to-end: the classifier is called exactly once across two verifyCompiledCandidate invocations for the identical candidate (cache reuse), when a shared cache is supplied", async () => {
    const text = "The Company may incur Indebtedness not to exceed $2,000,000.";
    const r1 = rule({ capacityExpression: money(2_000_000) });
    const r2 = rule({ capacityExpression: money(2_000_000) });
    const sharedCache = new InMemoryConditionSuspicionCache();
    const conditionSuspicionCaller = scriptedCaller(() => ({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] })) as StageCaller & { callCount: number };
    const input1: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r1] }) };
    const input2: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r2] }) };
    await verifyCompiledCandidate(input1, { conditionSuspicionCaller, conditionSuspicionCache: sharedCache });
    await verifyCompiledCandidate(input2, { conditionSuspicionCaller, conditionSuspicionCache: sharedCache });
    expect(conditionSuspicionCaller.callCount).toBe(1);
  });
});

describe("condition-suspicion-classifier - source-only independence (runtime confirmation, complements the static/type-level check in condition-suspicion-classifier-independence.test.ts)", () => {
  it("the classifier's own call receives ONLY the raw operativeSourceText as its content - the user-content string passed to the model never contains any JSON structure resembling the compiled IR (ruleId/capacityExpression/exprId are never present)", async () => {
    const capturedUserContent: string[] = [];
    const caller: StageCaller = {
      providerName: "test-provider",
      model: "test-model",
      isSynthetic: false,
      async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, userContent: string): Promise<T> {
        capturedUserContent.push(userContent);
        return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      },
      lastTelemetry: () => null,
    };
    const text = "The Company may incur Indebtedness not to exceed $2,000,000.";
    const r = rule({ capacityExpression: money(2_000_000), ruleId: "ir-rule:should-never-leak-into-classifier-prompt" });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }), compilationResult: compilationResult({ rules: [r] }) };
    await verifyCompiledCandidate(input, { conditionSuspicionCaller: caller, conditionSuspicionCache: new InMemoryConditionSuspicionCache() });
    expect(capturedUserContent).toHaveLength(1);
    expect(capturedUserContent[0]).toContain(text);
    expect(capturedUserContent[0]).not.toContain("ir-rule:should-never-leak-into-classifier-prompt");
    expect(capturedUserContent[0]).not.toContain("capacityExpression");
    expect(capturedUserContent[0]).not.toContain("ruleId");
  });
});

