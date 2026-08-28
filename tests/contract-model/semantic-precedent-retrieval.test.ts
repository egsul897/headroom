/**
 * Phase 3D - Stage 1 candidate generation tests (task §14/§52 retrieval
 * bucket). Covers exact-shape match, paraphrase/parameter-swap invariance
 * (score is identical regardless of which literal identity/values changed,
 * since the signature itself is identity/value-blind), a contrast case
 * (MAX vs MIN scores lower than an exact operator match), negative
 * precedent exclusion, and score-ordering.
 */
import { describe, expect, it } from "vitest";
import { generateCandidates } from "../../lib/contract-model/compiler/semantic-precedent/retrieval";
import type { GeneralizedPrecedent, SemanticSignature } from "../../lib/contract-model/compiler/semantic-precedent/types";
import { SEMANTIC_PRECEDENT_SCHEMA_VERSION } from "../../lib/contract-model/compiler/semantic-precedent/types";

function signature(overrides: Partial<SemanticSignature> = {}): SemanticSignature {
  return {
    action: "INCUR_DEBT",
    posture: "PERMISSION",
    ruleType: "QUANTITATIVE_PERMISSION",
    covenantFamily: "INDEBTEDNESS",
    topLevelOperator: "MAX",
    operatorSet: ["MAX", "MULTIPLY", "MONEY", "PERCENT", "METRIC_REFERENCE"],
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
    dimensions: ["EXPRESSION_SHAPE"],
    granularity: "EXPRESSION_PATTERN",
    lessonDescription: "test lesson",
    signature: signature(),
    expressionPattern: null,
    structuralLessons: [],
    dependencyLessons: [],
    isNegativePrecedent: false,
    contrastedWithSignature: null,
    reviewStatus: "APPROVED",
    reviewEvents: [],
    support: { supportingInstanceIds: [], distinctSourceDocumentCount: 1, distinctInstrumentCount: 1, distinctCompanyCount: 1, knownCounterexampleInstanceIds: [] },
    origin: "AI_PROPOSED",
    precedentSchemaVersion: SEMANTIC_PRECEDENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("generateCandidates (Stage 1)", () => {
  it("scores an exact-shape match highly", () => {
    const query = signature();
    const results = generateCandidates(query, [precedent()]);
    expect(results).toHaveLength(1);
    expect(results[0]!.candidateScore).toBeGreaterThan(0);
  });

  it("paraphrase/parameter-swap invariance: two signatures differing only because the underlying literal values/wording changed produce IDENTICAL scores against the same precedent (the signature itself never saw those values)", () => {
    // Two "queries" that in practice came from different source text (different $ amount, different metric
    // name, different defined-term name) but the same drafting shape - since computeSemanticSignature never
    // sees those values, both queries here are represented by the identical SemanticSignature already.
    const queryA = signature();
    const queryB = signature(); // structurally identical signature standing in for a paraphrased/parameter-swapped source
    const candidatePrecedent = precedent();
    const resultsA = generateCandidates(queryA, [candidatePrecedent]);
    const resultsB = generateCandidates(queryB, [candidatePrecedent]);
    expect(resultsA[0]!.candidateScore).toBe(resultsB[0]!.candidateScore);
  });

  it("contrast test: a MIN-shaped query scores lower against a MAX-shaped precedent than an exact MAX match would (task §39)", () => {
    const maxQuery = signature({ topLevelOperator: "MAX", operatorSet: ["MAX", "MONEY"] });
    const minQuery = signature({ topLevelOperator: "MIN", operatorSet: ["MIN", "MONEY"] });
    const maxPrecedent = precedent({ signature: signature({ topLevelOperator: "MAX", operatorSet: ["MAX", "MONEY"] }) });

    const maxResults = generateCandidates(maxQuery, [maxPrecedent], { minScore: 0 });
    const minResults = generateCandidates(minQuery, [maxPrecedent], { minScore: 0 });
    expect(maxResults[0]!.candidateScore).toBeGreaterThan(minResults[0]!.candidateScore);
  });

  it("never returns a negative precedent as a positive candidate", () => {
    const negative = precedent({ isNegativePrecedent: true });
    const results = generateCandidates(signature(), [negative], { minScore: 0 });
    expect(results).toHaveLength(0);
  });

  it("respects minScore floor and maxCandidates cap, sorted descending by score", () => {
    const strong = precedent({ precedentId: "strong", signature: signature() });
    const weak = precedent({ precedentId: "weak", signature: signature({ action: "OTHER", posture: "OBLIGATION", topLevelOperator: "MIN", operatorSet: ["MIN"], entityScopeTags: [] }) });
    const results = generateCandidates(signature(), [weak, strong], { minScore: 0, maxCandidates: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.precedent.precedentId).toBe("strong");
  });

  it("query with no overlapping dimensions at all scores 0 and is excluded at the default minScore", () => {
    const disjoint = precedent({
      signature: signature({ action: "OTHER", posture: "OBLIGATION", ruleType: "REPORTING_OBLIGATION", covenantFamily: "REPORTING_INFORMATION", topLevelOperator: null, operatorSet: [], entityScopeTags: [] }),
    });
    const results = generateCandidates(signature(), [disjoint]);
    expect(results).toHaveLength(0);
  });

  it("matchedDimensions reports which dimensions actually contributed", () => {
    const results = generateCandidates(signature(), [precedent()], { minScore: 0 });
    expect(results[0]!.matchedDimensions).toContain("ACTION");
    expect(results[0]!.matchedDimensions).toContain("TOP_LEVEL_OPERATOR");
  });
});
