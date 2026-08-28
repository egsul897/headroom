/**
 * Phase 3D - Stage 2 applicability ranking tests (task §15/§16/§27/§52).
 * Covers: strong-match -> APPLICABLE, weak-match -> INSUFFICIENT_EVIDENCE,
 * quality-signal downgrade (APPROVED_WITH_LIMITATIONS / counterexamples
 * cap APPLICABLE down to PARTIALLY_APPLICABLE, never up), pairwise conflict
 * detection (same bucket, different shape -> CONFLICTING, never silently
 * resolved by score), and negative-precedent contrast warnings.
 */
import { describe, expect, it } from "vitest";
import { checkNegativePrecedentWarnings, rankApplicability } from "../../lib/contract-model/compiler/semantic-precedent/applicability";
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

describe("rankApplicability (Stage 2)", () => {
  it("a full core-dimension match is APPLICABLE", () => {
    const query = signature();
    const candidates = generateCandidates(query, [precedent()], { minScore: 0 });
    const matches = rankApplicability(candidates);
    expect(matches[0]!.applicability).toBe("APPLICABLE");
  });

  it("a weak match (only one core dimension) is INSUFFICIENT_EVIDENCE, not silently treated as applicable", () => {
    const query = signature();
    const weakPrecedent = precedent({ signature: signature({ posture: "OBLIGATION", topLevelOperator: "MIN", operatorSet: ["MIN"], entityScopeTags: [] }) });
    const candidates = generateCandidates(query, [weakPrecedent], { minScore: 0 });
    const matches = rankApplicability(candidates);
    expect(matches[0]!.applicability).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("APPROVED_WITH_LIMITATIONS caps an otherwise-APPLICABLE match down to PARTIALLY_APPLICABLE, never lifts a weaker one up", () => {
    const query = signature();
    const limited = precedent({ reviewStatus: "APPROVED_WITH_LIMITATIONS" });
    const candidates = generateCandidates(query, [limited], { minScore: 0 });
    const matches = rankApplicability(candidates);
    expect(matches[0]!.applicability).toBe("PARTIALLY_APPLICABLE");
    expect(matches[0]!.applicabilityReasoning).toContain("capped");
  });

  it("known counterexamples cap APPLICABLE down to PARTIALLY_APPLICABLE", () => {
    const query = signature();
    const withCounterexample = precedent({ support: { supportingInstanceIds: ["a"], distinctSourceDocumentCount: 1, distinctInstrumentCount: 1, distinctCompanyCount: 1, knownCounterexampleInstanceIds: ["bad-1"] } });
    const candidates = generateCandidates(query, [withCounterexample], { minScore: 0 });
    const matches = rankApplicability(candidates);
    expect(matches[0]!.applicability).toBe("PARTIALLY_APPLICABLE");
  });

  it("two precedents in the same action/posture bucket but with different top-level operators (MAX vs MIN) are marked CONFLICTING for each other rather than one silently winning by score", () => {
    const query = signature();
    const maxPrecedent = precedent({ precedentId: "max-prec", signature: signature({ topLevelOperator: "MAX" }) });
    const minPrecedent = precedent({ precedentId: "min-prec", signature: signature({ topLevelOperator: "MIN", operatorSet: ["MIN", "MONEY"] }) });
    const candidates = generateCandidates(query, [maxPrecedent, minPrecedent], { minScore: 0 });
    const matches = rankApplicability(candidates);

    const maxMatch = matches.find((m) => m.precedentId === "max-prec")!;
    const minMatch = matches.find((m) => m.precedentId === "min-prec")!;
    expect(maxMatch.applicability).toBe("CONFLICTING");
    expect(minMatch.applicability).toBe("CONFLICTING");
    expect(maxMatch.conflictsWithPrecedentIds).toContain("min-prec");
    expect(minMatch.conflictsWithPrecedentIds).toContain("max-prec");
  });

  it("a candidate with no conflict does not get contaminated by an unrelated conflicting pair", () => {
    const query = signature();
    const maxPrecedent = precedent({ precedentId: "max-prec", signature: signature({ topLevelOperator: "MAX" }) });
    const minPrecedent = precedent({ precedentId: "min-prec", signature: signature({ topLevelOperator: "MIN", operatorSet: ["MIN", "MONEY"] }) });
    const unrelated = precedent({ precedentId: "unrelated", signature: signature({ action: "OTHER", posture: "OBLIGATION", topLevelOperator: null, operatorSet: [], entityScopeTags: [] }) });
    const candidates = generateCandidates(query, [maxPrecedent, minPrecedent, unrelated], { minScore: 0 });
    const matches = rankApplicability(candidates);
    const unrelatedMatch = matches.find((m) => m.precedentId === "unrelated")!;
    expect(unrelatedMatch.applicability).not.toBe("CONFLICTING");
  });
});

describe("checkNegativePrecedentWarnings", () => {
  it("surfaces a NOT_APPLICABLE warning when the query matches a negative precedent's contrastedWithSignature", () => {
    const contrastedShape = signature({ topLevelOperator: "MAX" });
    const negative = precedent({
      isNegativePrecedent: true,
      contrastedWithSignature: contrastedShape,
      lessonDescription: "this looks like a shared cap but is actually an independent basket",
    });
    const warnings = checkNegativePrecedentWarnings(contrastedShape, [negative]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.applicability).toBe("NOT_APPLICABLE");
    expect(warnings[0]!.applicabilityReasoning).toContain("NOT equivalent");
  });

  it("does not warn when the query is dissimilar from the negative precedent's contrasted shape", () => {
    const contrastedShape = signature({ topLevelOperator: "MAX" });
    const negative = precedent({ isNegativePrecedent: true, contrastedWithSignature: contrastedShape });
    const dissimilarQuery = signature({ action: "OTHER", posture: "OBLIGATION", topLevelOperator: null, operatorSet: [], entityScopeTags: [] });
    const warnings = checkNegativePrecedentWarnings(dissimilarQuery, [negative]);
    expect(warnings).toHaveLength(0);
  });

  it("ignores a precedent flagged isNegativePrecedent but missing contrastedWithSignature (malformed data, never crashes)", () => {
    const negative = precedent({ isNegativePrecedent: true, contrastedWithSignature: null });
    expect(() => checkNegativePrecedentWarnings(signature(), [negative])).not.toThrow();
    expect(checkNegativePrecedentWarnings(signature(), [negative])).toHaveLength(0);
  });
});
