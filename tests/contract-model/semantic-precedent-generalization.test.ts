/**
 * Phase 3D - AI-assisted generalization workflow tests (task §22-§26/§52).
 * Uses a fake StageCaller (schema.parse(response), the same fixture
 * pattern scripts/phase-3c-catch-rate-summary.ts already established) -
 * zero cost, fully deterministic given a fixed fake response.
 *
 * Central properties under test: proposals always start PROPOSED/AI_PROPOSED
 * (never auto-approved), the signature is always independently computed
 * from the real reviewed IRRule (never trusted from the model), an
 * unjustified FIXED slot is mechanically forced back to VARIABLE, only
 * sufficiently-reviewed instances may ground a proposal, and entries with
 * divergent signatures are rejected rather than silently merged.
 */
import { describe, expect, it } from "vitest";
import { InconsistentGeneralizationInputError, proposeGeneralizedPrecedent, UnreviewedGeneralizationInputError } from "../../lib/contract-model/compiler/semantic-precedent/generalization";
import type { GeneralizationEntry } from "../../lib/contract-model/compiler/semantic-precedent/generalization";
import { computeSemanticSignature } from "../../lib/contract-model/compiler/semantic-precedent/signature";
import type { ReviewedInstance } from "../../lib/contract-model/compiler/semantic-precedent/types";
import { SEMANTIC_PRECEDENT_SCHEMA_VERSION } from "../../lib/contract-model/compiler/semantic-precedent/types";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import type { ZodType } from "zod";

let counter = 0;
function money(amount: number): IRExpression {
  counter++;
  return { exprId: `e-${counter}`, kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}
function percent(value: number): IRExpression {
  counter++;
  return { exprId: `e-${counter}`, kind: "PERCENT", type: "PERCENT", value };
}
function metric(metricName: string): IRExpression {
  counter++;
  return { exprId: `e-${counter}`, kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: "co", instrumentKey: "instr", resolvedDefinitionId: null };
}
function rule(overrides: Partial<IRRule> = {}): IRRule {
  counter++;
  return {
    ruleId: `rule-${counter}`,
    irSchemaVersion: "v1",
    companyId: "co-a",
    instrumentKey: "instr-a",
    sourceDocumentId: "doc-a",
    sourceSectionRef: "6.01",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: { exprId: "cap", kind: "MAX", type: "MONEY", operands: [money(1), { exprId: "mul", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.1), metric("Consolidated EBITDA")] }] },
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

function reviewedInstance(overrides: Partial<ReviewedInstance> = {}): ReviewedInstance {
  return {
    instanceId: `inst-${counter++}`,
    provenance: { companyId: "co-a", instrumentKey: "instr-a", sourceDocumentId: "doc-a", candidateRef: "cand-1", sourceSectionRef: "6.01", sourceTextHash: "h1", contextIdentity: "ctx-1", operativeStatus: null, benchmark: null },
    tenancy: "SYSTEM_REVIEWED",
    proposedIrSnapshot: {},
    verifierFindingsSnapshot: null,
    reviewedIrSnapshot: {},
    reviewStatus: "APPROVED",
    reviewEvents: [],
    irSchemaVersion: "v1",
    compilerVersion: "v1",
    verifierVersion: "v1",
    precedentSystemVersion: SEMANTIC_PRECEDENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeCaller(response: unknown): StageCaller {
  return {
    providerName: "test-provider",
    model: "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      return schema.parse(response);
    },
    lastTelemetry: () => null,
  };
}

describe("proposeGeneralizedPrecedent", () => {
  it("produces a PROPOSED/AI_PROPOSED precedent, never auto-approved", async () => {
    const entry: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: rule() };
    const caller = fakeCaller({ lessonDescription: "greater-of test", dimensions: ["EXPRESSION_SHAPE"], granularity: "EXPRESSION_PATTERN", expressionPattern: null, structuralLessons: [], dependencyLessons: [], isNegativePrecedent: false });
    const precedent = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller });
    expect(precedent.reviewStatus).toBe("PROPOSED");
    expect(precedent.origin).toBe("AI_PROPOSED");
    expect(precedent.reviewEvents).toHaveLength(0);
  });

  it("computes the signature independently from the real reviewed IRRule, ignoring anything the model claims", async () => {
    const theRule = rule();
    const entry: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: theRule };
    const caller = fakeCaller({ lessonDescription: "x", dimensions: [], granularity: "EXPRESSION_PATTERN", expressionPattern: null, structuralLessons: [], dependencyLessons: [], isNegativePrecedent: false });
    const precedent = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller });
    expect(precedent.signature).toEqual(computeSemanticSignature(theRule));
  });

  it("forces an unjustified FIXED slot back to VARIABLE (whyFixed missing)", async () => {
    const entry: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: rule() };
    const caller = fakeCaller({
      lessonDescription: "x",
      dimensions: [],
      granularity: "EXPRESSION_PATTERN",
      expressionPattern: { kind: "MAX", numericSlot: { mode: "FIXED", value: 75_000_000 }, children: [] },
      structuralLessons: [],
      dependencyLessons: [],
      isNegativePrecedent: false,
    });
    const precedent = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller });
    expect(precedent.expressionPattern?.numericSlot?.mode).toBe("VARIABLE");
  });

  it("keeps a properly-justified FIXED slot as FIXED", async () => {
    const entry: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: rule() };
    const caller = fakeCaller({
      lessonDescription: "x",
      dimensions: [],
      granularity: "EXPRESSION_PATTERN",
      expressionPattern: { kind: "PERCENT", numericSlot: { mode: "FIXED", value: 0.125, whyFixed: "a well-known regulatory threshold percentage" }, children: [] },
      structuralLessons: [],
      dependencyLessons: [],
      isNegativePrecedent: false,
    });
    const precedent = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller });
    expect(precedent.expressionPattern?.numericSlot).toEqual({ mode: "FIXED", value: 0.125, whyFixed: "a well-known regulatory threshold percentage" });
  });

  it("tolerant-matches an out-of-vocabulary dimension/granularity to a safe fallback rather than crashing", async () => {
    const entry: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: rule() };
    const caller = fakeCaller({ lessonDescription: "x", dimensions: ["totally unknown dimension"], granularity: "not a real granularity", expressionPattern: null, structuralLessons: [], dependencyLessons: [], isNegativePrecedent: false });
    const precedent = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller });
    expect(precedent.dimensions).toEqual(["EXPRESSION_SHAPE"]);
    expect(precedent.granularity).toBe("EXPRESSION_PATTERN");
  });

  it("rejects an instance whose reviewStatus is not APPROVED/APPROVED_WITH_LIMITATIONS", async () => {
    const entry: GeneralizationEntry = { instance: reviewedInstance({ reviewStatus: "PROPOSED" }), reviewedRule: rule() };
    await expect(proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller: fakeCaller({ lessonDescription: "x", isNegativePrecedent: false }) })).rejects.toThrow(UnreviewedGeneralizationInputError);
  });

  it("rejects entries whose underlying rules have divergent signatures rather than silently merging them", async () => {
    const entryA: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: rule() };
    const entryB: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: rule({ capacityExpression: { exprId: "min", kind: "MIN", type: "MONEY", operands: [money(1), money(2)] } }) };
    await expect(proposeGeneralizedPrecedent([entryA, entryB], { tenancy: "SYSTEM_REVIEWED", caller: fakeCaller({ lessonDescription: "x", isNegativePrecedent: false }) })).rejects.toThrow(InconsistentGeneralizationInputError);
  });

  it("computes diversity/support metadata deterministically from provenance, never trusting the model", async () => {
    const entryA: GeneralizationEntry = { instance: reviewedInstance({ instanceId: "inst-a", provenance: { ...reviewedInstance().provenance, companyId: "co-x", sourceDocumentId: "doc-x", instrumentKey: "instr-x" } }), reviewedRule: rule() };
    const entryB: GeneralizationEntry = { instance: reviewedInstance({ instanceId: "inst-b", provenance: { ...reviewedInstance().provenance, companyId: "co-y", sourceDocumentId: "doc-y", instrumentKey: "instr-y" } }), reviewedRule: rule() };
    const caller = fakeCaller({ lessonDescription: "x", isNegativePrecedent: false });
    const precedent = await proposeGeneralizedPrecedent([entryA, entryB], { tenancy: "SYSTEM_REVIEWED", caller });
    expect(precedent.support.distinctCompanyCount).toBe(2);
    expect(precedent.support.distinctSourceDocumentCount).toBe(2);
    expect(precedent.support.supportingInstanceIds.sort()).toEqual(["inst-a", "inst-b"]);
  });

  it("a negative-precedent proposal sets contrastedWithSignature to the reviewed shape itself, computed independently", async () => {
    const theRule = rule();
    const entry: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: theRule };
    const caller = fakeCaller({ lessonDescription: "looks like X but is not", isNegativePrecedent: true, negativeContrastNote: "superficially similar to a shared cap but is actually independent" });
    const precedent = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller });
    expect(precedent.isNegativePrecedent).toBe(true);
    expect(precedent.contrastedWithSignature).toEqual(computeSemanticSignature(theRule));
  });

  it("produces a stable, content-derived precedentId (idempotency - task §51)", async () => {
    const entry: GeneralizationEntry = { instance: reviewedInstance(), reviewedRule: rule() };
    const response = { lessonDescription: "x", isNegativePrecedent: false };
    const first = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller: fakeCaller(response) });
    const second = await proposeGeneralizedPrecedent([entry], { tenancy: "SYSTEM_REVIEWED", caller: fakeCaller(response) });
    expect(first.precedentId).toBe(second.precedentId);
  });

  it("throws on an empty entries array rather than fabricating a precedent from nothing", async () => {
    await expect(proposeGeneralizedPrecedent([], { tenancy: "SYSTEM_REVIEWED", caller: fakeCaller({}) })).rejects.toThrow(InconsistentGeneralizationInputError);
  });
});
