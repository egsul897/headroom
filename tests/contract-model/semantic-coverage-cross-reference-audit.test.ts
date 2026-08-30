/**
 * Phase 3E §159 - cross-section relationship + operative-state audit
 * tests. Real IR fixture shapes throughout.
 */
import { describe, expect, it } from "vitest";
import { withExpressionId, computeRuleId } from "../../lib/contract-model/ir/identity";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { OperativeContractState, OperativeProvisionView } from "../../lib/contract-model/compiler/amendment/types";
import { applyOperativeStateFindingsToCoverage, auditCrossSectionRelationships, auditOperativeStateForUnits } from "../../lib/contract-model/compiler/semantic-coverage/cross-reference-audit";
import type { MaterialSemanticUnit } from "../../lib/contract-model/compiler/semantic-coverage/types";

const companyId = "test-co";
const instrumentKey = "test-instrument";

let seq = 0;
function makeUnit(overrides: Partial<MaterialSemanticUnit> = {}): MaterialSemanticUnit {
  seq += 1;
  return {
    semanticUnitId: `unit-${seq}`,
    companyId,
    packageKey: "test-pkg",
    instrumentKey,
    operativeVersionRef: null,
    granularity: "SEMANTIC_UNIT",
    anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::7.02(a)", structuralNodeId: "id-doc-1-7.02(a)", sectionRef: "7.02(a)", charStart: 0, charEnd: 10, sourceCitation: "doc-1::7.02(a)" }],
    family: "INDEBTEDNESS",
    familyEvidence: null,
    postureSignal: "PERMISSION_SIGNAL",
    materiality: "MATERIAL",
    materialityReasoning: "test",
    contextuallyElevated: false,
    excerptText: "test",
    detectedSignals: [],
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

describe("Phase 3E cross-section relationship audit", () => {
  it("emits a MISSING finding when a unit's shared_cap signal has no corresponding IR relationship anywhere in the document", () => {
    const unit = makeUnit({ detectedSignals: ["shared_cap"], materiality: "CRITICAL" });
    const rules = [makeRule({ sourceSectionRef: "7.02(a)" })]; // no shared-cap dependency on this rule
    const findings = auditCrossSectionRelationships([unit], rules);
    const sharedCap = findings.find((f) => f.relationshipType === "SHARED_CAP");
    expect(sharedCap).toBeDefined();
    expect(sharedCap!.found).toBe(false);
    expect(sharedCap!.materiality).toBe("CRITICAL");
  });

  it("emits no finding when the corresponding relationship IS present somewhere in the document's compiled IR", () => {
    const unit = makeUnit({ detectedSignals: ["shared_cap"] });
    const rule = makeRule({ sourceSectionRef: "7.02(a)", capacityExpression: withExpressionId({ kind: "LEDGER_USAGE_REFERENCE", type: "MONEY", ruleId: null, sharedCapId: "shared-cap-1" }) });
    const findings = auditCrossSectionRelationships([unit], [rule]);
    expect(findings.find((f) => f.relationshipType === "SHARED_CAP")).toBeUndefined();
  });

  it("emits a RECLASSIFICATION_OR_REDESIGNATION finding when signaled but no dependency edge exists anywhere", () => {
    const unit = makeUnit({ detectedSignals: ["reclassification"] });
    const rules = [makeRule({ sourceSectionRef: "7.02(a)" })];
    const findings = auditCrossSectionRelationships([unit], rules);
    expect(findings.find((f) => f.relationshipType === "RECLASSIFICATION_OR_REDESIGNATION")?.found).toBe(false);
  });

  it("finds the reclassification relationship when a real dependsOn edge exists on ANY rule in the document, not just the signaled unit's own anchored rule", () => {
    const unit = makeUnit({ detectedSignals: ["reclassification"], anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::7.02(a)", structuralNodeId: "id-doc-1-7.02(a)", sectionRef: "7.02(a)", charStart: 0, charEnd: 10, sourceCitation: "doc-1::7.02(a)" }] });
    const ruleA = makeRule({ sourceSectionRef: "7.02(a)" });
    const ruleB = makeRule({ sourceSectionRef: "7.02(b)", dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: ruleA.ruleId, description: "cross-basket reclassification right" }] });
    const findings = auditCrossSectionRelationships([unit], [ruleA, ruleB]);
    expect(findings.find((f) => f.relationshipType === "RECLASSIFICATION_OR_REDESIGNATION")).toBeUndefined();
  });

  it("never emits a finding for a relationship type no unit's signal implied", () => {
    const unit = makeUnit({ detectedSignals: ["currency_value"] });
    const findings = auditCrossSectionRelationships([unit], []);
    expect(findings).toHaveLength(0);
  });
});

function makeProvision(overrides: Partial<OperativeProvisionView> = {}): OperativeProvisionView {
  return {
    instrumentKey,
    provisionKey: "prov-1",
    kind: "SECTION",
    documentId: "doc-1",
    sectionRef: "7.02(a)",
    definedTermRef: null,
    asOfDate: "2026-01-01",
    currentSourceDocumentId: "doc-1",
    currentSourceNodeKey: "doc-1::7.02(a)",
    currentSourceNodeId: "id-doc-1-7.02(a)",
    currentText: "test",
    fullChain: [],
    appliedChain: [],
    supersededSourceNodeKeys: [],
    supersededSourceNodeIds: [],
    status: "OPERATIVE_STATE_RESOLVED",
    unresolvedIssues: [],
    conflicts: [],
    targetResolutionStatus: "UNIQUE",
    targetResolutionReason: null,
    candidateSourceNodeIds: [],
    structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
    structuralHealthIssues: [],
    attemptedText: null,
    reviewRequired: false,
    candidateTexts: [],
    ...overrides,
  };
}

function makeOperativeState(provisions: OperativeProvisionView[]): OperativeContractState {
  return { instrumentKey, asOfDate: "2026-01-01", provisions, status: "OPERATIVE_STATE_RESOLVED", summary: "test", unattachedEffects: [] };
}

describe("Phase 3E operative-state audit for units", () => {
  it("flags STALE_SUPERSEDED_TEXT_CREDITED when a unit's anchor node is in a provision's supersededSourceNodeKeys", () => {
    const unit = makeUnit();
    const provision = makeProvision({ supersededSourceNodeKeys: ["doc-1::7.02(a)"], supersededSourceNodeIds: ["id-doc-1-7.02(a)"], currentSourceNodeKey: "doc-2::7.02(a)-amended", currentSourceNodeId: "id-doc-2-7.02(a)-amended" });
    const findings = auditOperativeStateForUnits([unit], makeOperativeState([provision]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.findingType).toBe("STALE_SUPERSEDED_TEXT_CREDITED");
  });

  it("flags OPERATIVE_STATE_UNRESOLVED_FOR_UNIT when the covering provision's own status is not RESOLVED", () => {
    const unit = makeUnit();
    const provision = makeProvision({ status: "OPERATIVE_STATE_CONFLICTED" });
    const findings = auditOperativeStateForUnits([unit], makeOperativeState([provision]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.findingType).toBe("OPERATIVE_STATE_UNRESOLVED_FOR_UNIT");
  });

  it("emits no finding when the unit's provision is current and RESOLVED", () => {
    const unit = makeUnit();
    const provision = makeProvision();
    const findings = auditOperativeStateForUnits([unit], makeOperativeState([provision]));
    expect(findings).toHaveLength(0);
  });

  it("emits no finding for a raw-source-fallback unit with no structural node anchor (cannot be checked against operative state)", () => {
    const unit = makeUnit({ anchors: [{ documentId: "doc-1", structuralNodeKey: null, structuralNodeId: null, sectionRef: null, charStart: 0, charEnd: 10, sourceCitation: "doc-1::raw[0-10]" }] });
    const findings = auditOperativeStateForUnits([unit], makeOperativeState([makeProvision()]));
    expect(findings).toHaveLength(0);
  });

  // Phase 3F.1.6.R BLOCKER-4 fix: a null operativeState used to be handled
  // entirely by the CALLER (semantic-coverage/pipeline.ts's own
  // `input.operativeState ? auditOperativeStateForUnits(...) : []`), which
  // silently produced ZERO findings - a fail-OPEN precisely when the
  // caller could not resolve operative state at all. The fix moved this
  // fail-CLOSED handling INTO auditOperativeStateForUnits itself.
  describe("BLOCKER-4 fix: null operativeState fails CLOSED, never silently open", () => {
    it("flags every unit with a real structural anchor when operativeState is null, rather than emitting zero findings", () => {
      const unit = makeUnit();
      const findings = auditOperativeStateForUnits([unit], null);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.findingType).toBe("OPERATIVE_STATE_UNRESOLVED_FOR_UNIT");
      expect(findings[0]!.provisionKey).toBeNull();
      expect(findings[0]!.reasoning).toMatch(/no OperativeContractState was available/);
    });

    it("still emits nothing for a raw-source-fallback unit with no structural anchor even when operativeState is null (nothing to check either way)", () => {
      const unit = makeUnit({ anchors: [{ documentId: "doc-1", structuralNodeKey: null, structuralNodeId: null, sectionRef: null, charStart: 0, charEnd: 10, sourceCitation: "doc-1::raw[0-10]" }] });
      expect(auditOperativeStateForUnits([unit], null)).toHaveLength(0);
    });

    it("a null operativeState can never let reconciliation.ts reach FULLY_REPRESENTED_VERIFIED for a unit that required operative-state knowledge - applyOperativeStateFindingsToCoverage overrides it to OPERATIVE_STATE_UNRESOLVED", () => {
      const unit = makeUnit();
      // Simulate reconciliation.ts having already (wrongly, in isolation)
      // reached FULLY_REPRESENTED_VERIFIED for this unit - exactly the
      // "confident but wrong" state Architecture Invariant #13 forbids.
      const priorEntry = { semanticUnitId: unit.semanticUnitId, coverageState: "FULLY_REPRESENTED_VERIFIED" as const, matchedIrIds: ["rule-1"], missingEconomicElement: null, reasoning: "reconciled without operative-state knowledge", materiality: unit.materiality, coverageAlgorithmVersion: "test" };
      const findings = auditOperativeStateForUnits([unit], null);
      expect(findings).toHaveLength(1);
      const { entries } = applyOperativeStateFindingsToCoverage([priorEntry], [], findings, [unit]);
      expect(entries[0]!.coverageState).toBe("OPERATIVE_STATE_UNRESOLVED");
      expect(entries[0]!.coverageState).not.toBe("FULLY_REPRESENTED_VERIFIED");
    });
  });

  // Phase 3F.1.6.R BLOCKER-6 fix (certification finding SP-1 / Chain 2):
  // the coveringProvision lookup previously matched ONLY on
  // currentSourceNodeId (null for AMBIGUOUS) or a bare sectionRef string
  // (never populated for DEFINITION-kind provisions at all) - so an
  // AMBIGUOUS DEFINITION-kind provision's real candidateSourceNodeIds were
  // never consulted, and a unit anchored to one of the real ambiguous
  // occurrences was invisible to this audit.
  describe("BLOCKER-6 fix: AMBIGUOUS DEFINITION-kind provisions are now matched via candidateSourceNodeIds", () => {
    it("flags OPERATIVE_STATE_UNRESOLVED_FOR_UNIT for a unit anchored to one of an AMBIGUOUS DEFINITION-kind provision's real candidateSourceNodeIds, even though currentSourceNodeId and sectionRef are both null", () => {
      const unit = makeUnit({ anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::def-a", structuralNodeId: "id-doc-1-def-a", sectionRef: null, charStart: 0, charEnd: 10, sourceCitation: "doc-1::def-a" }] });
      const provision = makeProvision({
        kind: "DEFINITION",
        sectionRef: null, // DEFINITION-kind provisions never populate sectionRef, even when AMBIGUOUS.
        currentSourceNodeId: null, // AMBIGUOUS -> no single occurrence resolved.
        currentSourceNodeKey: null,
        targetResolutionStatus: "AMBIGUOUS",
        targetResolutionReason: "2 real physical definitions of this term collide",
        candidateSourceNodeIds: ["id-doc-1-def-a", "id-doc-1-def-b"],
        status: "OPERATIVE_STATE_PARTIAL",
      });
      const findings = auditOperativeStateForUnits([unit], makeOperativeState([provision]));
      expect(findings).toHaveLength(1);
      expect(findings[0]!.findingType).toBe("OPERATIVE_STATE_UNRESOLVED_FOR_UNIT");
      expect(findings[0]!.provisionKey).toBe(provision.provisionKey);
      expect(findings[0]!.reasoning).toMatch(/candidateSourceNodeIds/);
    });

    it("the OTHER real ambiguous candidate node is flagged too - never only the first one checked", () => {
      const unitB = makeUnit({ anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::def-b", structuralNodeId: "id-doc-1-def-b", sectionRef: null, charStart: 500, charEnd: 560, sourceCitation: "doc-1::def-b" }] });
      const provision = makeProvision({ kind: "DEFINITION", sectionRef: null, currentSourceNodeId: null, currentSourceNodeKey: null, targetResolutionStatus: "AMBIGUOUS", targetResolutionReason: "ambiguous", candidateSourceNodeIds: ["id-doc-1-def-a", "id-doc-1-def-b"], status: "OPERATIVE_STATE_PARTIAL" });
      const findings = auditOperativeStateForUnits([unitB], makeOperativeState([provision]));
      expect(findings).toHaveLength(1);
      expect(findings[0]!.findingType).toBe("OPERATIVE_STATE_UNRESOLVED_FOR_UNIT");
    });

    it("never widens matching for an already-RESOLVED provision - candidateSourceNodeIds is empty whenever targetResolutionStatus is UNIQUE, so this fix cannot manufacture a false match", () => {
      const unit = makeUnit();
      const provision = makeProvision(); // UNIQUE/RESOLVED, candidateSourceNodeIds: [] by default.
      const findings = auditOperativeStateForUnits([unit], makeOperativeState([provision]));
      expect(findings).toHaveLength(0);
    });
  });
});
