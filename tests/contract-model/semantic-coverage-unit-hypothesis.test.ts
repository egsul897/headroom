/**
 * Phase 3E §155 - Layer A/B deterministic semantic-unit hypothesis tests.
 * Real parse -> route -> hypothesize pipeline, never a mocked StructuralIndex.
 */
import { describe, expect, it } from "vitest";
import { routeDocument } from "../../lib/contract-model/compiler/semantic-coverage/router";
import { classifyFamily, hypothesizeUnitsForDocument, splitEnumeratedItems } from "../../lib/contract-model/compiler/semantic-coverage/unit-hypothesis";
import { buildTestIndex } from "./context-retrieval-test-utils";

const SAMPLE_DOCUMENT = `
ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:

(a) Indebtedness existing on the Closing Date in an aggregate principal amount not to exceed $10,000,000;
(b) Indebtedness incurred to finance the acquisition of fixed assets in an aggregate amount not to exceed $5,000,000 at any time outstanding;
(c) unsecured Indebtedness of the Borrower to any Restricted Subsidiary.

Section 6.02 Liens. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property, except Permitted Liens.

Section 1.01 Definitions.

"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, the sum of (a) Consolidated Interest Expense, (b) provision for taxes, and (c) depreciation and amortization expense, in each case for such period.
`;

const CTX = { companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, operativeVersionRef: null };

function buildIndex() {
  return buildTestIndex([{ documentId: "doc-1", label: "Credit Agreement", text: SAMPLE_DOCUMENT }]);
}

describe("Phase 3E unit hypothesis: splitEnumeratedItems (task §7/§13)", () => {
  it("returns null when fewer than two genuine markers are found - never forces an artificial split", () => {
    expect(splitEnumeratedItems("The Borrower shall not create any Indebtedness.")).toBeNull();
  });

  it("splits a chapeau + 3 enumerated exceptions into 3 real item spans", () => {
    const text = 'shall not create Indebtedness, except: (a) Indebtedness in an amount not to exceed $10,000,000; (b) Indebtedness in an amount not to exceed $5,000,000; (c) unsecured intercompany Indebtedness.';
    const split = splitEnumeratedItems(text);
    expect(split).not.toBeNull();
    expect(split!.items).toHaveLength(3);
    expect(split!.items[0]!.text).toContain("$10,000,000");
    expect(split!.items[1]!.text).toContain("$5,000,000");
  });
});

describe("Phase 3E unit hypothesis: classifyFamily (task §9, open taxonomy)", () => {
  it("classifies via headingHint first", () => {
    expect(classifyFamily("some unrelated text", "Section 6.01 Indebtedness").family).toBe("INDEBTEDNESS");
  });

  it("falls back to OTHER_UNCLASSIFIED with evidence when nothing matches - never silently dropped", () => {
    const result = classifyFamily("The Borrower shall maintain a fleet of delivery vehicles in good working order.", null);
    expect(result.family).toBe("OTHER_UNCLASSIFIED");
    expect(result.evidence).toBeTruthy();
  });
});

describe("Phase 3E unit hypothesis: hypothesizeUnitsForDocument (task §7/§8/§10)", () => {
  it("emits a separate unit for the umbrella prohibition PLUS one per enumerated carve-out, each carrying its own capacityExpression-worthy economic signal", () => {
    const index = buildIndex();
    const routing = routeDocument("doc-1", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);

    const carveoutA = units.find((u) => u.excerptText.includes("$10,000,000"));
    const carveoutB = units.find((u) => u.excerptText.includes("$5,000,000"));
    expect(carveoutA).toBeDefined();
    expect(carveoutB).toBeDefined();
    // task's own worked example: an enumerated exception with a stated cap is modeled as its
    // own separate PERMISSION unit with CRITICAL materiality (it carries its own economic signal).
    expect(carveoutA!.postureSignal).toBe("PERMISSION_SIGNAL");
    expect(carveoutA!.materiality).toBe("CRITICAL");
    expect(carveoutB!.postureSignal).toBe("PERMISSION_SIGNAL");
    expect(carveoutB!.materiality).toBe("CRITICAL");
  });

  it("the umbrella chapeau unit itself is classified as a prohibition", () => {
    const index = buildIndex();
    const routing = routeDocument("doc-1", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    const chapeau = units.find((u) => u.excerptText.includes("shall not, and shall not permit") && u.family === "INDEBTEDNESS");
    expect(chapeau).toBeDefined();
    expect(chapeau!.postureSignal).toBe("PROHIBITION_SIGNAL");
  });

  it("classifies every unit's family via the nearest section heading", () => {
    const index = buildIndex();
    const routing = routeDocument("doc-1", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    const indebtednessUnits = units.filter((u) => u.family === "INDEBTEDNESS");
    expect(indebtednessUnits.length).toBeGreaterThan(0);
    const liensUnit = units.find((u) => u.excerptText.includes("Permitted Liens"));
    expect(liensUnit?.family).toBe("LIENS");
  });

  it("classifies the definitions region as DEFINITIONAL_SIGNAL, never PROHIBITION/PERMISSION", () => {
    const index = buildIndex();
    const routing = routeDocument("doc-1", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    const ebitda = units.find((u) => u.excerptText.includes("Consolidated EBITDA"));
    expect(ebitda).toBeDefined();
    expect(ebitda!.postureSignal).toBe("DEFINITIONAL_SIGNAL");
  });

  it("every unit has a stable, content-derived, non-empty semanticUnitId reproducible across repeated calls", () => {
    const index = buildIndex();
    const routing = routeDocument("doc-1", index);
    const first = hypothesizeUnitsForDocument(routing, index, CTX);
    const second = hypothesizeUnitsForDocument(routing, index, CTX);
    expect(first.map((u) => u.semanticUnitId).sort()).toEqual(second.map((u) => u.semanticUnitId).sort());
    for (const u of first) expect(u.semanticUnitId.length).toBeGreaterThan(0);
  });

  it("never forces a 1:1 split for a region with no genuine enumeration - Liens section stays one unit", () => {
    const index = buildIndex();
    const routing = routeDocument("doc-1", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    const liensUnits = units.filter((u) => u.excerptText.includes("Permitted Liens"));
    expect(liensUnits).toHaveLength(1);
  });
});
