/**
 * Never unlimited by default, and never unlimited from an idiom. Assertions go through the public categorize() and
 * evaluateBasket() on realistic clauses; they do not restate the regex.
 */
import { describe, expect, it } from "vitest";
import { categorize, evaluateBasket } from "@/lib/contract-model/covenant-computation/baskets";
import type { BasketClause, ComputationPackage } from "@/lib/contract-model/covenant-computation/types";

const evalText = (operativeText: string) => {
  // The clause must bind to its document (citation check), so the document is the clause itself.
  const pkg = { packageKey: "t", companyId: "c", instrumentKey: "i", asOf: "2026-01-01", documents: [{ documentId: "d", text: operativeText, role: "INDENTURE" }], baskets: [], metrics: [], ratios: [] } as unknown as ComputationPackage;
  const clause: BasketClause = { stableKey: "k", sectionRef: "7.1(a)", covenantFamily: "DEBT_INCURRENCE", documentId: "d", operativeText, role: "PERMISSION" };
  return evaluateBasket(pkg, clause, [], []);
};

describe("unlimited capacity requires amount phrasing", () => {
  const idioms = [
    "(f) Indebtedness of any Subsidiary that is a Nova Scotia unlimited liability company owed to the Borrower or any Guarantor;",
    "(g) Investments in Subsidiaries, including (without limitation) capital contributions made in the ordinary course of business;",
    "(h) without limitation of the foregoing, Liens securing obligations not to exceed $25,000,000 at any time outstanding;",
    "(i) guarantees of obligations of Subsidiaries, including but without limitation guarantees of leases entered into in the ordinary course;",
  ];
  for (const t of idioms) {
    it(`idiom is not an unlimited grant: ${t.slice(4, 50)}`, () => {
      expect(categorize(t)).not.toBe("UNLIMITED");
      expect(evalText(t).capKind).not.toBe("UNLIMITED");
    });
  }
  it("the stated $25,000,000 ceiling survives the 'without limitation of the foregoing' idiom", () => {
    const b = evalText(idioms[2]!);
    expect(b.category).toBe("FIXED_DOLLAR");
    expect(b.capCanonical).toBe("25000000");
  });
  const grants = [
    "(j) Indebtedness owed by any Loan Party to any other Loan Party in an unlimited amount;",
    "(k) Restricted Payments made solely in Equity Interests of the Borrower, without limit as to amount, so long as no Event of Default exists;",
    "(l) Investments in Guarantors, which shall be unlimited in amount;",
  ];
  for (const t of grants) {
    it(`explicit amount phrasing is UNLIMITED: ${t.slice(4, 50)}`, () => {
      expect(categorize(t)).toBe("UNLIMITED");
    });
  }
  it("a clause with no number and no amount phrasing is NEEDS_INPUT, never unlimited", () => {
    const b = evalText("(m) Liens arising by operation of law in the ordinary course of business;");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capKind).toBe("NONE");
  });
});
