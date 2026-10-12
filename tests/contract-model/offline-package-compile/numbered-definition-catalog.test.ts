import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../../lib/contract-model/compiler/structural-references";
import {
  discoverDefinitionExceptionCatalogs,
  discoverRatioBasedSectionPermissions,
} from "../../../lib/contract-model/compiler/discovery/definition-exception-catalog";

/**
 * Indenture-style numbered + nested lettered Permitted Debt catalog.
 * Issuer-agnostic synthetic names — proves discovery without Matthews IDs.
 */
const NUMBERED_INDENTURE = `
INDENTURE

SECTION 1.01 Definitions.

"Permitted Widget Debt" means:
(1) (a) Debt under Debt Facilities in an aggregate principal amount outstanding not to exceed $1,300,000,000, plus
(b) additional Debt if the Secured Net Leverage Ratio would be no greater than 3.50 to 1.00; and
(2) Debt represented by the Notes issued on the Issue Date in an aggregate principal amount of $300,000,000;

SECTION 4.09 Limitation on Incurrence of Debt.

(a) The Company will not, and will not permit any Restricted Subsidiary to, Incur any Debt; provided that the Company may Incur Debt if, after giving effect to such Incurrence, the Consolidated Fixed Charge Coverage Ratio would be at least 2.00 to 1.00.

(b) Section 4.09(a) will not prohibit the Incurrence of Permitted Widget Debt.

SECTION 4.10 Limitation on Liens.

The Company will not create any Lien upon any Collateral, except Permitted Liens.
`;

function indexOf(text: string, documentId = "synth-indenture") {
  const nodes = parseDocumentStructure({ documentId, label: "Synth Indenture", text });
  const defs = detectStructuralDefinitions(documentId, text, nodes);
  const refs = detectStructuralReferences(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), defs, refs);
  return { index, defs };
}

describe("numbered + nested definition exception catalogs", () => {
  it("discovers (1)(a)/(1)(b)/(2) without issuer-specific refs", () => {
    const { index, defs } = indexOf(NUMBERED_INDENTURE);
    const catalogs = discoverDefinitionExceptionCatalogs(index, defs, ["synth-indenture"]);
    const debt = catalogs.find((c) => c.termExact === "Permitted Widget Debt");
    expect(debt).toBeTruthy();
    const markers = debt!.clauses.map((c) => c.marker);
    expect(markers).toEqual(expect.arrayContaining(["1)(a", "1)(b", "2"]));
    expect(debt!.clauses.find((c) => c.marker === "1)(a")!.text).toMatch(/not to exceed \$1,300,000,000/i);
    expect(debt!.clauses.find((c) => c.marker === "1)(b")!.text).toMatch(/Leverage Ratio/i);
    expect(debt!.clauses.find((c) => c.marker === "2")!.text).toMatch(/\$300,000,000/);

    const refs = debt!.candidates.map((c) => c.normalizedSourceRef);
    expect(refs).toEqual(
      expect.arrayContaining([
        "def:Permitted Widget Debt(1)(a)",
        "def:Permitted Widget Debt(1)(b)",
        "def:Permitted Widget Debt(2)",
      ]),
    );

    const blob = JSON.stringify(catalogs);
    expect(blob).not.toMatch(/\b(matthews|mhk|mohawk|conmed|chewy)\b/i);
  });

  it("discovers ratio-based section permissions under Limitation headings", () => {
    const { index } = indexOf(NUMBERED_INDENTURE);
    const ratios = discoverRatioBasedSectionPermissions(index, ["synth-indenture"]);
    expect(ratios.some((r) => r.normalizedSourceRef === "4.09(a)" && r.role === "RATIO_BASED_PERMISSION")).toBe(
      true,
    );
  });
});
