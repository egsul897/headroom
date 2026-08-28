/**
 * Phase 3D - end-to-end retrieval orchestration tests (retrieve.ts). Proves
 * the bounded top-K advisory cutoff (task §19) and that negative-precedent
 * warnings ride alongside positive matches in one PrecedentRetrievalResult.
 */
import { describe, expect, it } from "vitest";
import { retrievePrecedent } from "../../lib/contract-model/compiler/semantic-precedent/retrieve";
import type { GeneralizedPrecedent, SemanticSignature } from "../../lib/contract-model/compiler/semantic-precedent/types";
import { SEMANTIC_PRECEDENT_SCHEMA_VERSION } from "../../lib/contract-model/compiler/semantic-precedent/types";

function signature(overrides: Partial<SemanticSignature> = {}): SemanticSignature {
  return {
    action: "INCUR_DEBT",
    posture: "PERMISSION",
    ruleType: "QUANTITATIVE_PERMISSION",
    covenantFamily: "INDEBTEDNESS",
    topLevelOperator: "MAX",
    operatorSet: ["MAX", "MONEY", "PERCENT", "METRIC_REFERENCE"],
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

describe("retrievePrecedent (Stage 1 + Stage 2 orchestration)", () => {
  it("returns a bounded advisory list capped at maxAdvisoryPrecedents even when more candidates are APPLICABLE", () => {
    const query = signature();
    const precedents = [precedent(), precedent(), precedent(), precedent(), precedent()];
    const result = retrievePrecedent("cand-1", query, precedents, { minScore: 0, maxAdvisoryPrecedents: 2 });
    expect(result.candidateRef).toBe("cand-1");
    expect(result.boundedAdvisoryPrecedentIds.length).toBeLessThanOrEqual(2);
    expect(result.matches.filter((m) => m.applicability === "APPLICABLE").length).toBe(5);
  });

  it("defaults maxAdvisoryPrecedents to a small bounded number (never dumps the whole library)", () => {
    const query = signature();
    const precedents = Array.from({ length: 10 }, () => precedent());
    const result = retrievePrecedent("cand-1", query, precedents, { minScore: 0 });
    expect(result.boundedAdvisoryPrecedentIds.length).toBeLessThan(precedents.length);
  });

  it("never places a CONFLICTING or PARTIALLY_APPLICABLE precedent into boundedAdvisoryPrecedentIds", () => {
    const query = signature();
    const maxPrecedent = precedent({ precedentId: "max-prec", signature: signature({ topLevelOperator: "MAX" }) });
    const minPrecedent = precedent({ precedentId: "min-prec", signature: signature({ topLevelOperator: "MIN", operatorSet: ["MIN", "MONEY"] }) });
    const result = retrievePrecedent("cand-1", query, [maxPrecedent, minPrecedent], { minScore: 0 });
    expect(result.boundedAdvisoryPrecedentIds).not.toContain("max-prec");
    expect(result.boundedAdvisoryPrecedentIds).not.toContain("min-prec");
  });

  it("includes negative-precedent warnings in matches without ever including them in the advisory set", () => {
    const query = signature();
    const negative = precedent({ precedentId: "neg-1", isNegativePrecedent: true, contrastedWithSignature: signature() });
    const positive = precedent({ precedentId: "pos-1" });
    const result = retrievePrecedent("cand-1", query, [negative, positive], { minScore: 0 });
    const negativeMatch = result.matches.find((m) => m.precedentId === "neg-1");
    expect(negativeMatch?.applicability).toBe("NOT_APPLICABLE");
    expect(result.boundedAdvisoryPrecedentIds).not.toContain("neg-1");
    expect(result.boundedAdvisoryPrecedentIds).toContain("pos-1");
  });

  it("no precedents in the pool -> empty result, never an error (missing precedent must not break the caller)", () => {
    const result = retrievePrecedent("cand-1", signature(), []);
    expect(result.matches).toHaveLength(0);
    expect(result.boundedAdvisoryPrecedentIds).toHaveLength(0);
  });
});
