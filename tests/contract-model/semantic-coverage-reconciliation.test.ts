/**
 * Phase 3E §157 - reconciliation engine tests. Uses real IR shapes (the
 * same withExpressionId/computeRuleId helpers every other IR test uses),
 * never a mocked/loosely-typed rule object.
 */
import { describe, expect, it } from "vitest";
import { withExpressionId, computeRuleId } from "../../lib/contract-model/ir/identity";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { reconcileFrozenInventory, extractNumericValue } from "../../lib/contract-model/compiler/semantic-coverage/reconciliation";
import { freezeSourceInventory } from "../../lib/contract-model/compiler/semantic-coverage/freeze";
import type { FrozenSourceInventory, MaterialSemanticUnit } from "../../lib/contract-model/compiler/semantic-coverage/types";

const companyId = "test-co";
const instrumentKey = "test-instrument";

function makeUnit(overrides: Partial<MaterialSemanticUnit> & { semanticUnitId: string }): MaterialSemanticUnit {
  return {
    companyId,
    packageKey: "test-pkg",
    instrumentKey,
    operativeVersionRef: null,
    granularity: "SEMANTIC_UNIT",
    anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01(a)", sectionRef: "6.01(a)", charStart: 0, charEnd: 10, sourceCitation: "doc-1::6.01(a)" }],
    family: "INDEBTEDNESS",
    familyEvidence: null,
    postureSignal: "PERMISSION_SIGNAL",
    materiality: "CRITICAL",
    materialityReasoning: "test",
    contextuallyElevated: false,
    excerptText: "Indebtedness not to exceed $10,000,000",
    detectedSignals: ["currency_value"],
    fromRawSourceFallback: false,
    detectionMethod: "STRUCTURAL_HYPOTHESIS",
    aiInventoryPromptVersion: null,
    confidence: "HIGH",
    uncertaintyReasons: [],
    inventoryAlgorithmVersion: "test",
    provenance: "test",
    ...overrides,
  };
}

function makeFrozen(units: MaterialSemanticUnit[]): FrozenSourceInventory {
  return freezeSourceInventory({ companyId, packageKey: "test-pkg", instrumentKey, documentIds: ["doc-1"], units });
}

function makeCandidate(discoveryId: string, nodeKeys: string[]): DiscoveredCandidate {
  return {
    discoveryId,
    documentId: "doc-1",
    structuralNodeKeys: nodeKeys,
    normalizedSourceRef: nodeKeys[0]!,
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test candidate",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 0.9,
    sourceCitation: `doc-1::${nodeKeys[0]}`,
    discoveryRunVersion: "test",
  };
}

function makeRule(overrides: Partial<IRRule> & { sourceSectionRef: string }): IRRule {
  const { sourceSectionRef, ...rest } = overrides;
  return {
    ruleId: computeRuleId(companyId, instrumentKey, sourceSectionRef, "test"),
    irSchemaVersion: "headroom-covenant-ir.v1",
    companyId,
    instrumentKey,
    sourceDocumentId: "doc-1",
    sourceSectionRef,
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: withExpressionId({ kind: "MONEY", type: "MONEY", amount: 10_000_000, currency: "USD" }),
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: { documentId: "doc-1", sourceNodeKey: null, sourceCitation: `doc-1::${sourceSectionRef}`, excerpt: null },
    compilerVersion: null,
    sourceContentVersion: null,
    ...rest,
  };
}

describe("Phase 3E reconciliation: extractNumericValue", () => {
  it("extracts a dollar amount", () => expect(extractNumericValue("not to exceed $10,000,000")).toBe(10_000_000));
  it("extracts a percentage as a fraction", () => expect(extractNumericValue("12.5% of Consolidated EBITDA")).toBeCloseTo(0.125));
  it("returns null for text with no numeric signal", () => expect(extractNumericValue("unsecured intercompany Indebtedness")).toBeNull());
});

describe("Phase 3E reconciliation: DANGEROUS_UNACCOUNTED cases", () => {
  it("flags a CRITICAL unit with no discovered candidate as NO_CANDIDATE_EVER_DISCOVERED", () => {
    const unit = makeUnit({ semanticUnitId: "u1" });
    const frozen = makeFrozen([unit]);
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    expect(result.entries[0]!.coverageState).toBe("UNREPRESENTED");
    expect(result.dangerousUnaccounted).toHaveLength(1);
    expect(result.dangerousUnaccounted[0]!.reason).toBe("NO_CANDIDATE_EVER_DISCOVERED");
  });

  it("does not flag an INFORMATIONAL unit with no discovered candidate as dangerous", () => {
    const unit = makeUnit({ semanticUnitId: "u1", materiality: "INFORMATIONAL" });
    const frozen = makeFrozen([unit]);
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    expect(result.dangerousUnaccounted).toHaveLength(0);
  });

  it("flags a MATERIAL unit discovered but never compiled as CANDIDATE_DISCOVERED_NEVER_COMPILED", () => {
    const unit = makeUnit({ semanticUnitId: "u1", materiality: "MATERIAL" });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [], verifiedCandidateRefs: new Set() });
    expect(result.entries[0]!.coverageState).toBe("UNREPRESENTED");
    expect(result.dangerousUnaccounted[0]!.reason).toBe("CANDIDATE_DISCOVERED_NEVER_COMPILED");
  });

  it("flags a CRITICAL unit whose covering candidate compiled but omitted its economic value as COMPILED_BUT_UNIT_OMITTED_FROM_IR", () => {
    const unit = makeUnit({ semanticUnitId: "u1", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01(a)", sectionRef: "6.01(a)", charStart: 0, charEnd: 10, sourceCitation: "doc-1::6.01(a)" }] });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    // The compiled rule is anchored to a DIFFERENT section entirely and carries a different amount.
    const rule = makeRule({ sourceSectionRef: "6.01(b)", capacityExpression: withExpressionId({ kind: "MONEY", type: "MONEY", amount: 999, currency: "USD" }) });
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: "disc-1", rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set() });
    expect(result.entries[0]!.coverageState).toBe("UNREPRESENTED");
    expect(result.dangerousUnaccounted[0]!.reason).toBe("COMPILED_BUT_UNIT_OMITTED_FROM_IR");
  });
});

describe("Phase 3E reconciliation: FULLY_REPRESENTED / PARTIALLY_REPRESENTED cases", () => {
  it("classifies FULLY_REPRESENTED_REVIEW_REQUIRED when an anchored rule's own numeric value matches the unit's", () => {
    const unit = makeUnit({ semanticUnitId: "u1" });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    const rule = makeRule({ sourceSectionRef: "6.01(a)" }); // $10,000,000, matches unit's excerpt
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: "disc-1", rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set() });
    expect(result.entries[0]!.coverageState).toBe("FULLY_REPRESENTED_REVIEW_REQUIRED");
    expect(result.entries[0]!.matchedIrIds).toContain(rule.ruleId);
    expect(result.dangerousUnaccounted).toHaveLength(0);
  });

  it("upgrades to FULLY_REPRESENTED_VERIFIED when the covering candidate's ref is in verifiedCandidateRefs", () => {
    const unit = makeUnit({ semanticUnitId: "u1" });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    const rule = makeRule({ sourceSectionRef: "6.01(a)" });
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: "disc-1", rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set(["disc-1"]) });
    expect(result.entries[0]!.coverageState).toBe("FULLY_REPRESENTED_VERIFIED");
  });

  it("classifies PARTIALLY_REPRESENTED (naming the missing element) when the anchored rule's numeric value does not match", () => {
    const unit = makeUnit({ semanticUnitId: "u1", excerptText: "not to exceed $10,000,000" });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    const rule = makeRule({ sourceSectionRef: "6.01(a)", capacityExpression: withExpressionId({ kind: "MONEY", type: "MONEY", amount: 5_000_000, currency: "USD" }) });
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: "disc-1", rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set() });
    expect(result.entries[0]!.coverageState).toBe("PARTIALLY_REPRESENTED");
    expect(result.entries[0]!.missingEconomicElement).toBe("capacityExpression");
    // A PARTIALLY_REPRESENTED unit is surfaced, not silently dropped - never counted as dangerous-unaccounted.
    expect(result.dangerousUnaccounted).toHaveLength(0);
  });

  it("falls back to a whole-candidate-set numeric search when no rule is anchored to this exact citation", () => {
    const unit = makeUnit({ semanticUnitId: "u1", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01(a)", sectionRef: "6.01(a)", charStart: 0, charEnd: 10, sourceCitation: "doc-1::6.01(a)" }] });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    // Rule is anchored to a DIFFERENT citation but carries the SAME dollar figure - simulates a
    // legitimate merge into a broader rule during compilation.
    const rule = makeRule({ sourceSectionRef: "6.01(merged)" });
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: "disc-1", rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set() });
    expect(result.entries[0]!.coverageState).toBe("FULLY_REPRESENTED_REVIEW_REQUIRED");
    expect(result.dangerousUnaccounted).toHaveLength(0);
  });

  it("reports a non-numeric unit with an anchored rule as FULLY_REPRESENTED_REVIEW_REQUIRED (disclosed fine-grained-fidelity limitation)", () => {
    const unit = makeUnit({ semanticUnitId: "u1", excerptText: "unsecured intercompany Indebtedness", postureSignal: "PERMISSION_SIGNAL", materiality: "MATERIAL" });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    const rule = makeRule({ sourceSectionRef: "6.01(a)" });
    const result = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: "disc-1", rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set() });
    expect(result.entries[0]!.coverageState).toBe("FULLY_REPRESENTED_REVIEW_REQUIRED");
  });

  it("is reproducible - identical input produces identical coverage states", () => {
    const unit = makeUnit({ semanticUnitId: "u1" });
    const frozen = makeFrozen([unit]);
    const candidate = makeCandidate("disc-1", ["doc-1::6.01(a)"]);
    const rule = makeRule({ sourceSectionRef: "6.01(a)" });
    const input = { frozenInventory: frozen, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: "disc-1", rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set<string>() };
    const first = reconcileFrozenInventory(input);
    const second = reconcileFrozenInventory(input);
    expect(first.entries).toEqual(second.entries);
  });
});
