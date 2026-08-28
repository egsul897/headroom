/**
 * Phase 3F.1 Workstream B (F2) - contextual materiality propagation. The
 * DSGR first-blind run showed classifyMateriality() evaluating a unit's own
 * text signals in complete isolation from its structural role: several
 * Article VI (Negative Covenants) lettered basket sub-items (e.g. "(c)
 * unsecured Indebtedness of the Borrower to any Restricted Subsidiary" -
 * qualitative, no inline dollar/percentage/ratio) were classified
 * INFORMATIONAL by Phase 3E's own audit even though membership in a real
 * restrictive covenant's exception list is itself what makes an item a real
 * economic/legal permission, regardless of whether its own clause happens
 * to restate a number.
 *
 * All fixture text is invented for this file - no DSGR-specific content
 * (task §4's explicit prohibition, this session's established
 * anti-overfitting discipline).
 *
 * Task §39's required points (11-20), plus direct unit tests against
 * applyContextualMaterialityFloor.
 */
import { describe, expect, it } from "vitest";
import { routeDocument } from "../../lib/contract-model/compiler/semantic-coverage/router";
import { applyContextualMaterialityFloor, classifyMateriality, hypothesizeUnitsForDocument } from "../../lib/contract-model/compiler/semantic-coverage/unit-hypothesis";
import type { MaterialSemanticUnit } from "../../lib/contract-model/compiler/semantic-coverage/types";
import { buildTestIndex } from "./context-retrieval-test-utils";

const CTX = { companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, operativeVersionRef: null };

function buildIndex(text: string) {
  return buildTestIndex([{ documentId: "doc-1", label: "Credit Agreement", text }]);
}

function hypothesize(text: string) {
  const index = buildIndex(text);
  const routing = routeDocument("doc-1", index);
  return { units: hypothesizeUnitsForDocument(routing, index, CTX), index };
}

function unitAt(units: MaterialSemanticUnit[], sectionRef: string): MaterialSemanticUnit | undefined {
  return units.find((u) => u.anchors[0]?.sectionRef === sectionRef);
}

function baseUnit(overrides: Partial<MaterialSemanticUnit> = {}): MaterialSemanticUnit {
  return {
    semanticUnitId: overrides.semanticUnitId ?? "u-1",
    companyId: "co",
    packageKey: "pkg",
    instrumentKey: null,
    operativeVersionRef: null,
    granularity: "SEMANTIC_UNIT",
    anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01", sectionRef: "6.01", charStart: 0, charEnd: 10, sourceCitation: "doc-1::6.01" }],
    family: "INDEBTEDNESS",
    familyEvidence: null,
    postureSignal: "UNCLEAR_SIGNAL",
    materiality: "INFORMATIONAL",
    materialityReasoning: "test",
    contextuallyElevated: false,
    excerptText: "test text",
    detectedSignals: [],
    fromRawSourceFallback: false,
    detectionMethod: "STRUCTURAL_HYPOTHESIS",
    aiInventoryPromptVersion: null,
    confidence: "HIGH",
    uncertaintyReasons: [],
    inventoryAlgorithmVersion: "test-v1",
    provenance: "test",
    ...overrides,
  };
}

describe("Phase 3F.1 F2 - classifyMateriality cross-reference bump (§27)", () => {
  it("11. a qualitative basket item with no local numeric/keyword signal is NOT confidently INFORMATIONAL when it is a bare cross-reference to another provision's economics", () => {
    const result = classifyMateriality([], "Indebtedness permitted under Section 6.04 hereof.");
    expect(result.materiality).toBe("REVIEW_UNCERTAIN");
  });

  it("a unit with no signals and no cross-reference phrasing remains INFORMATIONAL (the bump is targeted, not universal)", () => {
    const result = classifyMateriality([], "This Agreement may be executed in counterparts.");
    expect(result.materiality).toBe("INFORMATIONAL");
  });
});

describe("Phase 3F.1 F2 - applyContextualMaterialityFloor unit tests", () => {
  it("12. an exception-list item referencing a definition elsewhere (no local signal) inherits a MATERIAL floor from its operative MATERIAL/PROHIBITION parent", () => {
    const parent = baseUnit({ semanticUnitId: "parent", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01", sectionRef: "6.01", charStart: 0, charEnd: 10, sourceCitation: "x" }], materiality: "MATERIAL", postureSignal: "PROHIBITION_SIGNAL" });
    const child = baseUnit({ semanticUnitId: "child", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01(c)", sectionRef: "6.01(c)", charStart: 0, charEnd: 10, sourceCitation: "y" }], materiality: "INFORMATIONAL", postureSignal: "PERMISSION_SIGNAL" });
    const indexStub = { getParent: (nodeKey: string) => (nodeKey === "doc-1::6.01(c)" ? { nodeKey: "doc-1::6.01" } : undefined) } as unknown as Parameters<typeof applyContextualMaterialityFloor>[1];
    const [, result] = applyContextualMaterialityFloor([parent, child], indexStub);
    expect(result!.materiality).toBe("MATERIAL");
    expect(result!.contextuallyElevated).toBe(true);
    expect(result!.materialityReasoning).toMatch(/ELEVATED to MATERIAL/);
  });

  it("14. a purely explanatory child under a MATERIAL parent whose own local materiality is already at/above MATERIAL is left unchanged (no downgrade, no double-elevation noise)", () => {
    const parent = baseUnit({ semanticUnitId: "parent", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01", sectionRef: "6.01", charStart: 0, charEnd: 10, sourceCitation: "x" }], materiality: "MATERIAL", postureSignal: "PROHIBITION_SIGNAL" });
    const child = baseUnit({ semanticUnitId: "child", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01(a)", sectionRef: "6.01(a)", charStart: 0, charEnd: 10, sourceCitation: "y" }], materiality: "CRITICAL", postureSignal: "PERMISSION_SIGNAL" });
    const indexStub = { getParent: (nodeKey: string) => (nodeKey === "doc-1::6.01(a)" ? { nodeKey: "doc-1::6.01" } : undefined) } as unknown as Parameters<typeof applyContextualMaterialityFloor>[1];
    const [, result] = applyContextualMaterialityFloor([parent, child], indexStub);
    expect(result!.materiality).toBe("CRITICAL"); // own independent signal preserved, never downgraded to the floor
    expect(result!.contextuallyElevated).toBe(false);
  });

  it("20. a list item under a non-operative (informational/definitional) parent does NOT automatically inherit MATERIAL - selective, not universal", () => {
    const parent = baseUnit({ semanticUnitId: "parent", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::9.01", sectionRef: "9.01", charStart: 0, charEnd: 10, sourceCitation: "x" }], materiality: "INFORMATIONAL", postureSignal: "UNCLEAR_SIGNAL" });
    const child = baseUnit({ semanticUnitId: "child", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::9.01(a)", sectionRef: "9.01(a)", charStart: 0, charEnd: 10, sourceCitation: "y" }], materiality: "INFORMATIONAL", postureSignal: "UNCLEAR_SIGNAL" });
    const indexStub = { getParent: (nodeKey: string) => (nodeKey === "doc-1::9.01(a)" ? { nodeKey: "doc-1::9.01" } : undefined) } as unknown as Parameters<typeof applyContextualMaterialityFloor>[1];
    const [, result] = applyContextualMaterialityFloor([parent, child], indexStub);
    expect(result!.materiality).toBe("INFORMATIONAL");
    expect(result!.contextuallyElevated).toBe(false);
  });

  it("a child of a MATERIAL parent whose posture is merely DEFINITIONAL_SIGNAL (not an operative restriction/obligation/exception) does not inherit the floor - materiality alone is not sufficient, posture matters too", () => {
    const parent = baseUnit({ semanticUnitId: "parent", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::1.01", sectionRef: "1.01", charStart: 0, charEnd: 10, sourceCitation: "x" }], materiality: "MATERIAL", postureSignal: "DEFINITIONAL_SIGNAL" });
    const child = baseUnit({ semanticUnitId: "child", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::1.01(a)", sectionRef: "1.01(a)", charStart: 0, charEnd: 10, sourceCitation: "y" }], materiality: "INFORMATIONAL", postureSignal: "UNCLEAR_SIGNAL" });
    const indexStub = { getParent: (nodeKey: string) => (nodeKey === "doc-1::1.01(a)" ? { nodeKey: "doc-1::1.01" } : undefined) } as unknown as Parameters<typeof applyContextualMaterialityFloor>[1];
    const [, result] = applyContextualMaterialityFloor([parent, child], indexStub);
    expect(result!.materiality).toBe("INFORMATIONAL");
  });

  it("a REVIEW_UNCERTAIN unit under an operative MATERIAL parent is floored to MATERIAL, not left ambiguous", () => {
    const parent = baseUnit({ semanticUnitId: "parent", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.08", sectionRef: "6.08", charStart: 0, charEnd: 10, sourceCitation: "x" }], materiality: "CRITICAL", postureSignal: "OBLIGATION_SIGNAL" });
    const child = baseUnit({ semanticUnitId: "child", anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.08(a)", sectionRef: "6.08(a)", charStart: 0, charEnd: 10, sourceCitation: "y" }], materiality: "REVIEW_UNCERTAIN", postureSignal: "UNCLEAR_SIGNAL" });
    const indexStub = { getParent: (nodeKey: string) => (nodeKey === "doc-1::6.08(a)" ? { nodeKey: "doc-1::6.08" } : undefined) } as unknown as Parameters<typeof applyContextualMaterialityFloor>[1];
    const [, result] = applyContextualMaterialityFloor([parent, child], indexStub);
    expect(result!.materiality).toBe("MATERIAL");
    // the floor never manufactures a second CRITICAL merely by nesting under a CRITICAL parent (types.ts's own documented reasoning for the 4-tier split)
  });

  it("a unit with no structural node (raw-source-fallback) is left entirely unchanged - nothing to inherit from", () => {
    const unit = baseUnit({ anchors: [{ documentId: "doc-1", structuralNodeKey: null, sectionRef: null, charStart: 0, charEnd: 10, sourceCitation: "raw" }] });
    const indexStub = { getParent: () => undefined } as unknown as Parameters<typeof applyContextualMaterialityFloor>[1];
    const [result] = applyContextualMaterialityFloor([unit], indexStub);
    expect(result).toEqual(unit);
  });

  it("a unit whose parent node was never itself hypothesized (a genuine remaining routing gap) is left unchanged rather than crashing or guessing", () => {
    const child = baseUnit({ anchors: [{ documentId: "doc-1", structuralNodeKey: "doc-1::6.01(z)", sectionRef: "6.01(z)", charStart: 0, charEnd: 10, sourceCitation: "y" }] });
    const indexStub = { getParent: () => ({ nodeKey: "doc-1::6.01" }) } as unknown as Parameters<typeof applyContextualMaterialityFloor>[1]; // parent node exists structurally, but no unit was ever built for it
    const [result] = applyContextualMaterialityFloor([child], indexStub);
    expect(result!.materiality).toBe("INFORMATIONAL");
    expect(result!.contextuallyElevated).toBe(false);
  });
});

describe("Phase 3F.1 F2 - end-to-end real parser + router + hypothesis pipeline", () => {
  const DOCUMENT = `
ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:

(a) Indebtedness existing on the Closing Date in an aggregate principal amount not to exceed $10,000,000;
(b) unsecured Indebtedness of the Borrower owing to any wholly owned Subsidiary of the Borrower, in each case permitted under Section 6.04 hereof;
(c) Indebtedness of the type described in clause (c) of the definition of Permitted Indebtedness.

Section 9.01 Notices. Any notice hereunder shall be given in writing and sent to the address set forth on the signature pages hereto.

(a) Notices may be delivered by hand, courier, or electronic mail.
`;

  it("13/16. real qualitative basket items (b) and (c) - neither has an inline dollar/percentage/ratio token - are elevated from INFORMATIONAL to MATERIAL via the contextual floor, closing the exact DSGR-confirmed gap", () => {
    const { units } = hypothesize(DOCUMENT);
    const itemB = unitAt(units, "6.01(b)");
    const itemC = unitAt(units, "6.01(c)");
    expect(itemB).toBeDefined();
    expect(itemC).toBeDefined();
    expect(itemB!.materiality === "MATERIAL" || itemB!.materiality === "CRITICAL").toBe(true);
    expect(itemC!.materiality === "MATERIAL" || itemC!.materiality === "CRITICAL").toBe(true);
    if (itemB!.materiality === "MATERIAL") expect(itemB!.contextuallyElevated).toBe(true);
    if (itemC!.materiality === "MATERIAL") expect(itemC!.contextuallyElevated).toBe(true);
  });

  it("15/17/18/19. an administrative notices sub-item under a non-operative parent (INFORMATIONAL, UNCLEAR_SIGNAL posture) does not inherit any floor - the fix does not inflate boilerplate", () => {
    const { units } = hypothesize(DOCUMENT);
    const noticesChapeau = unitAt(units, "9.01");
    const noticesItem = unitAt(units, "9.01(a)");
    // The chapeau itself must not be an operative restriction/obligation for this test to be meaningful.
    if (noticesChapeau) expect(noticesChapeau.postureSignal === "PROHIBITION_SIGNAL" || noticesChapeau.postureSignal === "OBLIGATION_SIGNAL").toBe(false);
    if (noticesItem) expect(noticesItem.contextuallyElevated).toBe(false);
  });
});
