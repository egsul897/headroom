import { describe, expect, it } from "vitest";
import { compileFrozenDebtPackage } from "../../../lib/contract-model/analysis/offline-package-compile";

/**
 * Synthetic multi-doc package — proves the entry point is issuer-agnostic
 * and refuses executable authority without verified IR / VEP.
 */
const ACME_CA = `
SECTION 1 DEFINITIONS AND TERMS.

"Permitted Widget Debt" means:
(a) the Obligation under this Agreement;
(b) Debt listed on Schedule 2.3;
(c) Capital Lease obligations in an aggregate amount not to exceed 5% of Total Assets;
(d) Secured Debt in a maximum aggregate amount not to exceed the difference between the Maximum Facility Amount and the Facility Amount when incurred;
(e) Debt of Restricted Subsidiaries organized outside the United States not to exceed $50,000,000;
(f) other senior unsecured Debt; provided that the maximum aggregate amount of such Debt that has a stated maturity prior to the Termination Date shall not exceed $600,000,000.

"Permitted Widget Liens" means:
(a) Liens securing the Obligation;
(b) Liens on the Collateral securing Debt of Borrower permitted by clause (d) of the definition of Permitted Widget Debt;
(c) purchase money liens which encumber only the assets acquired;
(d) Liens for Taxes not yet due.

"Maximum Facility Amount" means the greater of (a) $2,750,000,000, and (b) the product of (i) 3.50 and (ii) Adjusted EBITDA.
"Facility Amount" means the Total Commitment plus the aggregate amount of all Incremental Term Loan Facilities.
"Leverage Ratio" means the ratio of Consolidated Total Debt to Consolidated EBITDA.

SECTION 10 NEGATIVE COVENANTS.

10.4 Widget Debt. No Restricted Company shall create, incur or suffer to exist any Debt, other than Permitted Widget Debt.
10.5 Widget Liens. No Restricted Company shall create, incur, or suffer or permit to be created or incurred or to exist any Lien upon any of its assets, other than Permitted Widget Liens.
10.11 Financial. The Borrower shall not permit the Leverage Ratio to exceed 3.50 to 1.00.
`;

describe("compileFrozenDebtPackage (issuer-agnostic entry point)", () => {
  it("compiles a synthetic package, discovers catalogs, refuses executable authority", async () => {
    const result = await compileFrozenDebtPackage({
      companyId: "pp002-acme-synth",
      packageKey: "acme-widget-ca",
      documents: [{ documentId: "acme-doc-a", label: "Acme CA", text: ACME_CA }],
      authorizePaidInference: false,
    });

    expect(result.paidInferenceUsed).toBe(false);
    expect(result.stages.discovery.exceptionCatalogCount).toBeGreaterThanOrEqual(2);
    expect(result.exceptionCatalogs.some((c) => c.termExact === "Permitted Widget Debt")).toBe(true);
    expect(result.exceptionCatalogs.some((c) => c.termExact === "Permitted Widget Liens")).toBe(true);

    const debt = result.exceptionCatalogs.find((c) => c.termExact === "Permitted Widget Debt")!;
    expect(debt.clauses.some((c) => c.marker === "d")).toBe(true);
    const secured = debt.clauses.find((c) => c.marker === "d")!;
    expect(secured.text).toMatch(/Maximum Facility Amount/i);
    expect(secured.text).toMatch(/Facility Amount/i);

    const liens = result.exceptionCatalogs.find((c) => c.termExact === "Permitted Widget Liens")!;
    expect(liens.crossDefinitionLinks.some((l) => /Permitted Widget Debt/i.test(l.toTerm) && l.toMarker === "d")).toBe(true);

    expect(result.units.length).toBeGreaterThan(0);
    expect(result.summary.falseExecutableClassifications).toBe(0);
    // Fixed-dollar vertical slice may mark VERIFIED_EXECUTABLE for sole-cap baskets.
    const verified = result.units.filter((u) => u.executableAuthority === "VERIFIED_EXECUTABLE");
    for (const u of verified) {
      expect(u.fixedDollarSlice?.fidelityVerdict).toBe("PASS");
      expect(u.fixedDollarSlice?.productionRefusal).toMatch(/PRODUCTION_CAPACITY_REFUSED/);
    }
    expect(result.stages.capacityHandoff.outcome).toMatch(/REFUSED|VERTICAL_SLICE/);

    const blob = JSON.stringify(result.exceptionCatalogs);
    expect(blob).not.toMatch(/\b(MTN|Vail|CONMED|Mohawk|MHK|Chewy)\b/i);
  });
});
