/**
 * Phase 3E §158 - family/document/package coverage rollup tests.
 */
import { describe, expect, it } from "vitest";
import { computeFamilySummaries } from "../../lib/contract-model/compiler/semantic-coverage/family-coverage";
import { computeDocumentCoverage } from "../../lib/contract-model/compiler/semantic-coverage/document-coverage";
import { computePackageCoverage } from "../../lib/contract-model/compiler/semantic-coverage/package-coverage";
import type { DangerousUnaccountedSemanticUnit, DocumentCoverageResult, MaterialSemanticUnit, SemanticCoverageState, SemanticUnitCoverageEntry, SemanticUnitMateriality } from "../../lib/contract-model/compiler/semantic-coverage/types";

let seq = 0;
function makeUnit(overrides: Partial<MaterialSemanticUnit> = {}): MaterialSemanticUnit {
  seq += 1;
  return {
    semanticUnitId: `unit-${seq}`,
    companyId: "test-co",
    packageKey: "test-pkg",
    instrumentKey: null,
    operativeVersionRef: null,
    granularity: "SEMANTIC_UNIT",
    anchors: [],
    family: "INDEBTEDNESS",
    familyEvidence: null,
    postureSignal: "PERMISSION_SIGNAL",
    materiality: "MATERIAL",
    materialityReasoning: "test",
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

function makeEntry(unit: MaterialSemanticUnit, coverageState: SemanticCoverageState, missingEconomicElement: string | null = null): SemanticUnitCoverageEntry {
  return { semanticUnitId: unit.semanticUnitId, coverageState, matchedIrIds: [], missingEconomicElement, reasoning: "test", materiality: unit.materiality, coverageAlgorithmVersion: "test" };
}

function makeDangerous(unit: MaterialSemanticUnit): DangerousUnaccountedSemanticUnit {
  return { semanticUnitId: unit.semanticUnitId, reason: "NO_CANDIDATE_EVER_DISCOVERED", materiality: unit.materiality as Extract<SemanticUnitMateriality, "CRITICAL" | "MATERIAL">, sourceEvidence: unit.excerptText, auditorReasoning: "test" };
}

describe("Phase 3E family coverage rollup", () => {
  it("flags entireFamilyMissing when a family with a MATERIAL unit has zero representation anywhere", () => {
    const unit = makeUnit({ family: "LIENS", materiality: "MATERIAL" });
    const entries = [makeEntry(unit, "UNREPRESENTED")];
    const summaries = computeFamilySummaries([unit], entries, [makeDangerous(unit)]);
    const liens = summaries.find((s) => s.family === "LIENS")!;
    expect(liens.entireFamilyMissing).toBe(true);
    expect(liens.dangerousUnaccountedCount).toBe(1);
  });

  it("does not flag entireFamilyMissing when at least one unit in the family achieved partial representation", () => {
    const u1 = makeUnit({ family: "LIENS", materiality: "MATERIAL" });
    const u2 = makeUnit({ family: "LIENS", materiality: "CRITICAL" });
    const entries = [makeEntry(u1, "PARTIALLY_REPRESENTED", "capacityExpression"), makeEntry(u2, "UNREPRESENTED")];
    const summaries = computeFamilySummaries([u1, u2], entries, []);
    expect(summaries.find((s) => s.family === "LIENS")!.entireFamilyMissing).toBe(false);
  });

  it("never flags entireFamilyMissing for a family whose only units are INFORMATIONAL", () => {
    const unit = makeUnit({ family: "GUARANTEES", materiality: "INFORMATIONAL" });
    const entries = [makeEntry(unit, "UNREPRESENTED")];
    const summaries = computeFamilySummaries([unit], entries, []);
    expect(summaries.find((s) => s.family === "GUARANTEES")!.entireFamilyMissing).toBe(false);
  });

  it("computes distinct summaries per family, one summary per family present", () => {
    const units = [makeUnit({ family: "INDEBTEDNESS" }), makeUnit({ family: "LIENS" }), makeUnit({ family: "INDEBTEDNESS" })];
    const entries = units.map((u) => makeEntry(u, "FULLY_REPRESENTED_VERIFIED"));
    const summaries = computeFamilySummaries(units, entries, []);
    expect(summaries).toHaveLength(2);
    expect(summaries.find((s) => s.family === "INDEBTEDNESS")!.unitCount).toBe(2);
  });
});

describe("Phase 3E document coverage rollup", () => {
  it("fails the gate when any CRITICAL dangerous-unaccounted unit exists", () => {
    const unit = makeUnit({ materiality: "CRITICAL" });
    const entries = [makeEntry(unit, "UNREPRESENTED")];
    const result = computeDocumentCoverage("doc-1", [unit], entries, [makeDangerous(unit)]);
    expect(result.gateStatus).toBe("DOCUMENT_GATE_FAILED");
    expect(result.gateFailureReasons.some((r) => r.includes("CRITICAL"))).toBe(true);
  });

  it("passes the gate when every unit is fully represented and nothing is dangerous", () => {
    const units = [makeUnit({ materiality: "CRITICAL" }), makeUnit({ materiality: "MATERIAL" })];
    const entries = units.map((u) => makeEntry(u, "FULLY_REPRESENTED_VERIFIED"));
    const result = computeDocumentCoverage("doc-1", units, entries, []);
    expect(result.gateStatus).toBe("DOCUMENT_GATE_PASSED");
    expect(result.gateFailureReasons).toHaveLength(0);
  });

  it("materiality-weighted fraction drops much further than raw fraction when the ONE unrepresented unit is CRITICAL among many trivial ones", () => {
    const critical = makeUnit({ materiality: "CRITICAL" });
    const informational = Array.from({ length: 9 }, () => makeUnit({ materiality: "INFORMATIONAL" }));
    const units = [critical, ...informational];
    const entries = [makeEntry(critical, "UNREPRESENTED"), ...informational.map((u) => makeEntry(u, "FULLY_REPRESENTED_VERIFIED"))];
    const result = computeDocumentCoverage("doc-1", units, entries, [makeDangerous(critical)]);
    // raw fraction: 9/10 = 0.9 (looks fine) - weighted fraction must be far lower, since the
    // one missing unit carries almost all the real weight (8 of 8.9 total weight units).
    expect(result.rawFullyRepresentedFraction).toBeCloseTo(0.9);
    expect(result.materialityWeightedFullyRepresentedFraction).toBeLessThan(0.15);
  });

  it("fails the gate when an entire material family is missing, even with high raw coverage elsewhere", () => {
    const missingFamilyUnit = makeUnit({ family: "LIENS", materiality: "MATERIAL" });
    const otherUnits = Array.from({ length: 20 }, () => makeUnit({ family: "INDEBTEDNESS", materiality: "MATERIAL" }));
    const units = [missingFamilyUnit, ...otherUnits];
    const entries = [makeEntry(missingFamilyUnit, "UNREPRESENTED"), ...otherUnits.map((u) => makeEntry(u, "FULLY_REPRESENTED_VERIFIED"))];
    const result = computeDocumentCoverage("doc-1", units, entries, []);
    expect(result.rawFullyRepresentedFraction).toBeCloseTo(20 / 21);
    expect(result.gateStatus).toBe("DOCUMENT_GATE_FAILED");
    expect(result.gateFailureReasons.some((r) => r.includes("LIENS"))).toBe(true);
  });
});

describe("Phase 3E package coverage rollup", () => {
  const baseInput = { companyId: "test-co", packageKey: "test-pkg", auditIncompleteDocumentIds: [] as string[], structuralParserVersion: "test", aiInventoryPromptVersion: null, providerIdentity: null, frozenContentHash: "hash-1" };

  it("PACKAGE_AUDIT_INCOMPLETE takes priority when a document could not be audited at all", () => {
    const result = computePackageCoverage({ ...baseInput, documents: [], auditIncompleteDocumentIds: ["doc-1"] });
    expect(result.status).toBe("PACKAGE_AUDIT_INCOMPLETE");
  });

  it("PACKAGE_SEMANTICALLY_INCOMPLETE when any document's gate failed", () => {
    const failedDoc: DocumentCoverageResult = { documentId: "doc-1", units: [], coverageEntries: [], dangerousUnaccounted: [], familySummaries: [], rawFullyRepresentedFraction: 0.5, materialityWeightedFullyRepresentedFraction: 0.1, gateStatus: "DOCUMENT_GATE_FAILED", gateFailureReasons: ["1 CRITICAL dangerous-unaccounted unit"] };
    const result = computePackageCoverage({ ...baseInput, documents: [failedDoc] });
    expect(result.status).toBe("PACKAGE_SEMANTICALLY_INCOMPLETE");
  });

  it("PACKAGE_REVIEW_REQUIRED when documents pass their gate but carry review-worthy entries", () => {
    const reviewDoc: DocumentCoverageResult = { documentId: "doc-1", units: [], coverageEntries: [{ semanticUnitId: "u1", coverageState: "PARTIALLY_REPRESENTED", matchedIrIds: [], missingEconomicElement: "capacityExpression", reasoning: "x", materiality: "MATERIAL", coverageAlgorithmVersion: "test" }], dangerousUnaccounted: [], familySummaries: [], rawFullyRepresentedFraction: 0.9, materialityWeightedFullyRepresentedFraction: 0.9, gateStatus: "DOCUMENT_GATE_PASSED", gateFailureReasons: [] };
    const result = computePackageCoverage({ ...baseInput, documents: [reviewDoc] });
    expect(result.status).toBe("PACKAGE_REVIEW_REQUIRED");
  });

  it("PACKAGE_SEMANTICALLY_COVERED only when every document is clean", () => {
    const cleanDoc: DocumentCoverageResult = { documentId: "doc-1", units: [], coverageEntries: [{ semanticUnitId: "u1", coverageState: "FULLY_REPRESENTED_VERIFIED", matchedIrIds: [], missingEconomicElement: null, reasoning: "x", materiality: "MATERIAL", coverageAlgorithmVersion: "test" }], dangerousUnaccounted: [], familySummaries: [], rawFullyRepresentedFraction: 1, materialityWeightedFullyRepresentedFraction: 1, gateStatus: "DOCUMENT_GATE_PASSED", gateFailureReasons: [] };
    const result = computePackageCoverage({ ...baseInput, documents: [cleanDoc] });
    expect(result.status).toBe("PACKAGE_SEMANTICALLY_COVERED");
  });

  it("never returns a bare pass with zero explanatory reasons - statusReasons is always non-empty", () => {
    const cleanDoc: DocumentCoverageResult = { documentId: "doc-1", units: [], coverageEntries: [], dangerousUnaccounted: [], familySummaries: [], rawFullyRepresentedFraction: 1, materialityWeightedFullyRepresentedFraction: 1, gateStatus: "DOCUMENT_GATE_PASSED", gateFailureReasons: [] };
    const result = computePackageCoverage({ ...baseInput, documents: [cleanDoc] });
    expect(result.statusReasons.length).toBeGreaterThan(0);
  });

  it("PACKAGE_OPERATIVE_STATE_UNRESOLVED takes priority over a review-required signal", () => {
    const doc: DocumentCoverageResult = { documentId: "doc-1", units: [], coverageEntries: [{ semanticUnitId: "u1", coverageState: "OPERATIVE_STATE_UNRESOLVED", matchedIrIds: [], missingEconomicElement: null, reasoning: "x", materiality: "MATERIAL", coverageAlgorithmVersion: "test" }], dangerousUnaccounted: [], familySummaries: [], rawFullyRepresentedFraction: 1, materialityWeightedFullyRepresentedFraction: 1, gateStatus: "DOCUMENT_GATE_PASSED", gateFailureReasons: [] };
    const result = computePackageCoverage({ ...baseInput, documents: [doc] });
    expect(result.status).toBe("PACKAGE_OPERATIVE_STATE_UNRESOLVED");
  });
});
