/**
 * Phase 3E §156 - freeze mechanism tests (types.ts's FREEZE-BEFORE-LOAD
 * contract). Pure-function tests, no I/O.
 */
import { describe, expect, it } from "vitest";
import { freezeSourceInventory, verifyFrozenInventoryUnchanged } from "../../lib/contract-model/compiler/semantic-coverage/freeze";
import type { MaterialSemanticUnit } from "../../lib/contract-model/compiler/semantic-coverage/types";

function makeUnit(overrides: Partial<MaterialSemanticUnit> = {}): MaterialSemanticUnit {
  return {
    semanticUnitId: "unit-1",
    companyId: "test-co",
    packageKey: "test-pkg",
    instrumentKey: null,
    operativeVersionRef: null,
    granularity: "SEMANTIC_UNIT",
    anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01(a)", sectionRef: "6.01(a)", charStart: 0, charEnd: 10, sourceCitation: "doc-1::6.01(a)" }],
    family: "INDEBTEDNESS",
    familyEvidence: null,
    postureSignal: "PERMISSION_SIGNAL",
    materiality: "CRITICAL",
    materialityReasoning: "test",
    contextuallyElevated: false,
    excerptText: "test excerpt",
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

describe("Phase 3E freeze mechanism", () => {
  it("produces a stable, reproducible frozenContentHash for identical unit sets", () => {
    const units = [makeUnit()];
    const first = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units });
    const second = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units });
    expect(first.frozenContentHash).toBe(second.frozenContentHash);
  });

  it("changes the hash when a unit's own content changes - proves the freeze is real content-derived, not a label", () => {
    const base = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units: [makeUnit()] });
    const mutated = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units: [makeUnit({ materiality: "INFORMATIONAL" })] });
    expect(base.frozenContentHash).not.toBe(mutated.frozenContentHash);
  });

  it("is order-independent - the same units in a different order produce the same hash", () => {
    const unitA = makeUnit({ semanticUnitId: "unit-a" });
    const unitB = makeUnit({ semanticUnitId: "unit-b" });
    const first = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units: [unitA, unitB] });
    const second = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units: [unitB, unitA] });
    expect(first.frozenContentHash).toBe(second.frozenContentHash);
  });

  it("verifyFrozenInventoryUnchanged returns true for an untouched frozen inventory", () => {
    const frozen = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units: [makeUnit()] });
    expect(verifyFrozenInventoryUnchanged(frozen)).toBe(true);
  });

  it("verifyFrozenInventoryUnchanged returns false when a unit is mutated after freezing (tamper detection)", () => {
    const frozen = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units: [makeUnit()] });
    const tampered = { ...frozen, units: [makeUnit({ materiality: "INFORMATIONAL" })] };
    expect(verifyFrozenInventoryUnchanged(tampered)).toBe(false);
  });

  it("verifyFrozenInventoryUnchanged returns false when a unit is silently added after freezing", () => {
    const frozen = freezeSourceInventory({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: ["doc-1"], units: [makeUnit()] });
    const tampered = { ...frozen, units: [...frozen.units, makeUnit({ semanticUnitId: "unit-2" })] };
    expect(verifyFrozenInventoryUnchanged(tampered)).toBe(false);
  });
});
