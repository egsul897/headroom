/**
 * Reviewer FAIL on #363 @ b966c306: fragment matching produced wrong-section
 * matches (6.04→6.03, 2.09→2.28, 6.07→6.01). The strict matcher must reject them.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalFamily,
  excerptReflectedInCitation,
  isGenericAnchor,
  sectionNumberOf,
  strictCandidateMatch,
} from "@/lib/covenant-learning-factory/sweep/self-check";

const n = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const OPENER = "The Borrower will not, and will not permit any Subsidiary to, directly or indirectly, ";

function pair(candSec: string, candBody: string, citeSec: string, citeBody: string, candFam = "LIENS", bFam = "LIENS") {
  return {
    cand: { excerpt: n(`Section ${candSec} ${candBody}`), sectionRef: null, family: candFam },
    basket: { cite: n(`Section ${citeSec}. ${citeBody}`), sectionRef: `§${citeSec} Heading`, family: bFam },
  };
}

describe("strict reflection matcher", () => {
  it("generic negative-covenant openers are generic anchors", () => {
    expect(isGenericAnchor(n(OPENER).slice(0, 60))).toBe(true);
    expect(isGenericAnchor(n("Liens securing Capital Lease Obligations not exceeding $15,000,000 in aggregate"))).toBe(false);
  });

  for (const [a, b] of [["6.04", "6.03"], ["2.09", "2.28"], ["6.07", "6.01"]] as const) {
    it(`rejects a wrong-section match ${a} → ${b} that the legacy matcher accepted`, () => {
      const body = `${OPENER}enter into any transaction described herein.`;
      const { cand, basket } = pair(a, body, b, body);
      // legacy anchor logic matched on the generic body after the heading
      expect(excerptReflectedInCitation(n(body), basket.cite)).toBe(true);
      expect(strictCandidateMatch(cand, basket)).toBe(false);
    });
  }

  it("rejects same section when the only shared text is a generic opener", () => {
    const cand = { excerpt: n(`Section 6.02 ${OPENER}sell, transfer, lease or otherwise dispose of any property`), sectionRef: null, family: "ASSET_SALES" };
    const basket = { cite: n(`Section 6.02. Liens. ${OPENER}create, incur or suffer to exist any Lien upon any property`), sectionRef: "§6.02 Liens", family: "LIENS" };
    expect(strictCandidateMatch(cand, basket)).toBe(false);
  });

  it("accepts the same section with distinctive text", () => {
    const body = "Liens securing Capital Lease Obligations not exceeding $15,000,000 in the aggregate at any time";
    const { cand, basket } = pair("6.02", body, "6.02", `Liens. ${body}`);
    expect(strictCandidateMatch(cand, basket)).toBe(true);
  });

  it("without section numbers, requires the same canonical family (never OTHER)", () => {
    const body = n("(d) additional unsecured Debt of the Company in an amount not exceeding $50,000,000 outstanding");
    const b = { cite: body, sectionRef: "proviso", family: "DEBT_INCURRENCE" };
    expect(strictCandidateMatch({ excerpt: body, sectionRef: null, family: "INDEBTEDNESS" }, b)).toBe(true);
    expect(strictCandidateMatch({ excerpt: body, sectionRef: null, family: "LIENS" }, b)).toBe(false);
    expect(strictCandidateMatch({ excerpt: body, sectionRef: null, family: "UNKNOWN" }, { ...b, family: "OTHER" })).toBe(false);
  });

  it("parses section numbers and families", () => {
    expect(sectionNumberOf("§6.17 Financial Covenants (b)", "")).toBe("6.17");
    expect(sectionNumberOf(null, "section 6.04 liens")).toBe("6.4");
    expect(sectionNumberOf(null, "(a) the borrower")).toBe(null);
    expect(canonicalFamily("ASSET_SALES")).toBe(canonicalFamily("ASSET_SALE"));
    expect(canonicalFamily("OTHER")).toBe(null);
  });
});
