import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../../lib/contract-model/compiler/structural-references";
import {
  discoverDefinitionExceptionCatalogs,
  discoverProhibitionToPermittedLinks,
  discoverSectionExceptionCatalogs,
} from "../../../lib/contract-model/compiler/discovery/definition-exception-catalog";

/**
 * Synthetic issuer-agnostic fixture — deliberately NOT MTN / CONMED / Chewy.
 * Uses "Acme Holdings" and "Permitted Widget Debt" to prove no issuer hardcoding.
 */
const SYNTHETIC = `
SECTION 1 DEFINITIONS AND TERMS.

"Permitted Widget Debt" means:
(a) the Obligation under this Agreement;
(b) Debt listed on Schedule 2.3;
(c) Capital Lease obligations in an aggregate amount not to exceed 5% of Total Assets;
(d) Secured Debt in a maximum aggregate amount not to exceed the difference between the Maximum Facility Amount and the Facility Amount when incurred, so long as an intercreditor agreement is in effect;
(e) Debt of Restricted Subsidiaries organized outside the United States not to exceed $50,000,000;
(f) other senior unsecured Debt; provided that the maximum aggregate amount of such Debt that has a stated maturity prior to the Termination Date shall not exceed $600,000,000.

"Permitted Widget Liens" means:
(a) Liens securing the Obligation;
(b) Liens on the Collateral securing Debt of Borrower permitted by clause (d) of the definition of Permitted Widget Debt;
(c) purchase money liens which encumber only the assets acquired;
(d) Liens for Taxes not yet due.

"Maximum Facility Amount" means the greater of (a) $2,750,000,000, and (b) the product of (i) 3.50 and (ii) Adjusted EBITDA.

"Facility Amount" means the Total Commitment plus the aggregate amount of all Incremental Term Loan Facilities.

SECTION 10 NEGATIVE COVENANTS.

10.4 Widget Debt. No Restricted Company shall create, incur or suffer to exist any Debt, other than Permitted Widget Debt.
10.5 Widget Liens. No Restricted Company shall create, incur, or suffer or permit to be created or incurred or to exist any Lien upon any of its assets, other than Permitted Widget Liens.
`;

function indexOf(text: string, documentId = "acme-doc-a") {
  const nodes = parseDocumentStructure({ documentId, label: "Acme CA", text });
  const defs = detectStructuralDefinitions(documentId, text, nodes);
  const refs = detectStructuralReferences(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), defs, refs);
  return { index, defs, nodes };
}

describe("definition-exception-catalog (issuer-agnostic)", () => {
  it("discovers lettered Permitted* catalogs and prohibition links without issuer names", () => {
    const { index, defs } = indexOf(SYNTHETIC);
    const catalogs = discoverDefinitionExceptionCatalogs(index, defs);
    const terms = catalogs.map((c) => c.termExact).sort();
    expect(terms).toEqual(expect.arrayContaining(["Permitted Widget Debt", "Permitted Widget Liens"]));

    const debt = catalogs.find((c) => c.termExact === "Permitted Widget Debt")!;
    expect(debt.clauses.length).toBeGreaterThanOrEqual(5);
    expect(debt.clauses.some((c) => c.marker === "d")).toBe(true);
    expect(debt.supportStatus === "SUPPORTED_STRUCTURE" || debt.supportStatus === "PARTIAL_STRUCTURE").toBe(true);

    const liens = catalogs.find((c) => c.termExact === "Permitted Widget Liens")!;
    expect(liens.crossDefinitionLinks.some((l) => /Permitted Widget Debt/i.test(l.toTerm) && l.toMarker === "d")).toBe(true);

    const prohibitions = discoverProhibitionToPermittedLinks(index, ["acme-doc-a"]);
    expect(prohibitions.some((p) => p.role === "GENERAL_PROHIBITION" && /Permitted Widget Debt/i.test(p.description))).toBe(true);
    expect(prohibitions.some((p) => /Permitted Widget Liens/i.test(p.description))).toBe(true);

    // No MTN / Vail / CONMED leakage in discovery ids or descriptions for this fixture.
    const blob = JSON.stringify({ catalogs, prohibitions });
    expect(blob).not.toMatch(/Vail|MTN|CONMED|Chewy|Gibraltar/i);
  });

  it("does not invent catalogs for non-enumerated definitions", () => {
    const text = `
SECTION 1 DEFINITIONS.
"Simple Term" means cash and cash equivalents.
SECTION 2.
`;
    const { index, defs } = indexOf(text, "plain-doc");
    const catalogs = discoverDefinitionExceptionCatalogs(index, defs);
    expect(catalogs.filter((c) => c.termExact === "Simple Term")).toHaveLength(0);
  });

  it("discovers unquoted Permitted* means catalogs (common CA drafting)", () => {
    const text = `
SECTION 1 DEFINITIONS.
 Permitted Alpha Debt means:
 (a) the Obligation;
 (b) Debt not to exceed $25,000,000;
 (c) Secured Debt not to exceed the difference between the Maximum Facility Amount and the Facility Amount.
SECTION 7 NEGATIVE COVENANTS.
7.01 Debt. No Restricted Company shall incur any Debt, other than Permitted Alpha Debt.
`;
    const { index, defs } = indexOf(text, "unquoted-doc");
    // Structural defs may miss unquoted terms — catalog discovery must still find them.
    const catalogs = discoverDefinitionExceptionCatalogs(index, defs, ["unquoted-doc"]);
    expect(catalogs.some((c) => c.termExact === "Permitted Alpha Debt" && c.clauses.length >= 3)).toBe(true);
  });

  it("discovers section-embedded exception catalogs (other than the following / except:)", () => {
    // MHK-style drafting: baskets live in the section, not a Permitted* definition.
    // Includes unicode NNBSP after markers (common EDGAR extract artifact).
    const nnbsp = "\u202f";
    const text = `
ARTICLE VII NEGATIVE COVENANTS.

7.01${nnbsp}${nnbsp}Liens .
 Create, incur, assume or suffer to exist any Lien upon any of its property,
other than the following:

 (${"a"})${nnbsp}${nnbsp}Liens pursuant to any Loan Document;

 (${"b"})${nnbsp}${nnbsp}Liens existing on the Effective Date;

 (${"c"})${nnbsp}${nnbsp}Liens for taxes not yet due;

 (${"d"})${nnbsp}${nnbsp}additional Liens securing obligations; provided that the aggregate amount,
when combined with Indebtedness under Section 7.03(g), shall not exceed $1,500,000,000.

7.02 [Reserved] .

7.03${nnbsp}${nnbsp}Indebtedness .
 Create, incur, assume or suffer to exist any Indebtedness, except:

 (${"a"})${nnbsp}${nnbsp}Indebtedness under the Loan Documents;

 (${"b"})${nnbsp}${nnbsp}Indebtedness listed on Schedule 7.03;

 (${"c"})${nnbsp}${nnbsp}Guarantees of Indebtedness otherwise permitted;

 (${"d"})${nnbsp}${nnbsp}unsecured intercompany Indebtedness;

 (${"e"})${nnbsp}${nnbsp}capital leases permitted under Section 7.01(i);

 (${"f"})${nnbsp}${nnbsp}Permitted Receivables Financings not to exceed $700,000,000;

 (${"g"})${nnbsp}${nnbsp}additional Indebtedness not to exceed the greater of 10% of Total Consolidated Assets and $1,500,000,000,
when combined with Liens under Section 7.01(u).

7.04 Investments .
`;
    const { index } = indexOf(text, "section-catalog-doc");
    const catalogs = discoverSectionExceptionCatalogs(index, ["section-catalog-doc"]);
    const refs = catalogs.map((c) => c.termExact).sort();
    expect(refs.some((r) => /7\.01/.test(r))).toBe(true);
    expect(refs.some((r) => /7\.03/.test(r))).toBe(true);

    const liens = catalogs.find((c) => /7\.01/.test(c.termExact))!;
    expect(liens.clauses.length).toBeGreaterThanOrEqual(4);
    expect(liens.clauses.some((c) => c.marker === "d")).toBe(true);

    const debt = catalogs.find((c) => /7\.03/.test(c.termExact))!;
    expect(debt.clauses.length).toBeGreaterThanOrEqual(7);
    expect(debt.clauses.some((c) => c.marker === "g")).toBe(true);
    expect(
      debt.crossDefinitionLinks.some((l) => /7\.01/i.test(l.toTerm) && l.toMarker === "u") ||
        liens.crossDefinitionLinks.some((l) => /7\.03/i.test(l.toTerm) && l.toMarker === "g"),
    ).toBe(true);

    const blob = JSON.stringify(catalogs);
    expect(blob).not.toMatch(/Vail|MTN|CONMED|Mohawk|MHK/i);
  });
});
