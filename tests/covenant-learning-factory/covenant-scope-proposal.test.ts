import { afterEach, describe, expect, it } from "vitest";
import { conditionBound, outOfCovenantScope, strictConditionReflected } from "../../lib/covenant-learning-factory/sweep/self-check";
import { buildTreeLocator } from "../../lib/covenant-learning-factory/sweep/tree-locator";

const opening = "Except as otherwise provided in this Agreement, ";
const cond = opening + "no Member shall demand or receive a return of its Capital Contributions or withdraw from the Company.";
const unrelated = opening + "the Borrower may not assign or transfer any of its rights or obligations under this Agreement without consent.";

afterEach(() => { delete process.env.CLF_STRICT_CONDITION_MATCH; delete process.env.CLF_SCOPE_COVENANT; });

describe("condition binding (30-char opening weakness)", () => {
  it("legacy binds an unrelated citation that shares only the boilerplate opening", () => {
    expect(conditionBound(cond, unrelated)).toBe(true);
  });
  it("strict mode rejects the boilerplate-only match", () => {
    process.env.CLF_STRICT_CONDITION_MATCH = "1";
    expect(conditionBound(cond, unrelated)).toBe(false);
  });
  it("strict mode still binds a citation that contains the condition", () => {
    process.env.CLF_STRICT_CONDITION_MATCH = "1";
    expect(conditionBound(cond, "Section 6.02 Liens. " + cond + " Further text.")).toBe(true);
  });
});

describe("covenant scope (opt-in)", () => {
  const loc = { candidateSection: () => null, citationSection: () => null, isCovenantSection: (s: string | null) => (s === "7.1" ? true : s === "9.1" ? false : null) };
  it("is off by default", () => { expect(outOfCovenantScope(loc, "9.1")).toBe(false); });
  it("drops only sections positively classified non-covenant; unknown stays counted", () => {
    process.env.CLF_SCOPE_COVENANT = "1";
    expect(outOfCovenantScope(loc, "9.1")).toBe(true);
    expect(outOfCovenantScope(loc, "7.1")).toBe(false);
    expect(outOfCovenantScope(loc, null)).toBe(false);
    expect(outOfCovenantScope(null, "9.1")).toBe(false);
  });
  it("real tree: a negative covenant section is in scope, an agency section is not", () => {
    process.env.CLF_SCOPE_COVENANT = "1";
    const doc = [
      "ARTICLE VI", "NEGATIVE COVENANTS", "", "Section 6.01. Liens. The Borrower will not, and will not permit any Subsidiary to, create, incur or assume any Lien on any of its property, except Liens securing obligations not exceeding $10,000,000.", "",
      "ARTICLE IX", "THE ADMINISTRATIVE AGENT", "", "Section 9.01. Appointment of Agent. Each Lender hereby irrevocably appoints the Administrative Agent as its agent and authorizes it to take such actions on its behalf.", "",
    ].join("\n");
    const l = buildTreeLocator({ documentText: doc, candidates: [] });
    expect(l.isCovenantSection!("6.1")).toBe(true);
    expect(l.isCovenantSection!("9.1")).toBe(false);
  });
});

describe("strict condition match: MAE / consent / discretion boilerplate is generic (reviewer cases)", () => {
  it("'(d) No consent' boilerplate shared with an unrelated basket does not bind", () => {
    const c = "(d) No consent, approval or waiver shall be required, except as otherwise provided in this Agreement.";
    const b = "Section 6.02 Liens. (d) No consent, approval or waiver shall be required, except as otherwise provided in this Agreement, and Liens securing Indebtedness not exceeding $5,000,000.";
    expect(strictConditionReflected(c.slice(0, 60), b)).toBe(false);
  });
  it("'Committee may, in its sole discretion' does not bind", () => {
    const c = "The Committee may, in its sole discretion, and except as otherwise provided herein,";
    expect(strictConditionReflected(c, "Other text. " + c + " permit Investments up to $10,000,000.")).toBe(false);
  });
  it("a distinctive condition contained in the citation binds", () => {
    const c = "except Liens on accounts receivable sold in a Permitted Receivables Financing not exceeding $50,000,000";
    expect(strictConditionReflected(c, "Section 6.02 Liens. (k) " + c + ".")).toBe(true);
  });
});

describe("covenant scope fails closed on missed headings (reviewer cases)", () => {
  const mk = (sections: string[]) => sections.join("\n\n");
  it("'No Loan Party nor any Subsidiary shall' sections stay in scope even when the heading is missed (ehb 6.01/6.04/6.06)", () => {
    process.env.CLF_SCOPE_COVENANT = "1";
    const doc = mk([
      "ARTICLE VI", "MISCELLANEOUS PROVISIONS",
      "6.01 Liens. No Loan Party nor any Subsidiary of a Loan Party shall, at any time, create, incur, assume or suffer to exist any Lien on any of its assets.",
      "6.04 Disposition of Assets. No Loan Party nor any Subsidiary of a Loan Party shall sell, convey, pledge, assign or lease any of its assets.",
      "6.06 Partnerships; Mergers or Consolidation. No Loan Party nor any Subsidiary of a Loan Party shall enter into any partnership or merge.",
      "6.09 Counterparts. This Agreement may be executed in counterparts, each of which shall be an original.",
    ]);
    const l = buildTreeLocator({ documentText: doc, candidates: [] });
    for (const s of ["6.1", "6.4", "6.6"]) expect(l.isCovenantSection!(s), s).toBe(true);
    expect(l.isCovenantSection!("6.9")).toBe(false);
  });
  it("a representation 'No Loan Party is …' is not made a covenant by the lead-in rule", () => {
    const doc = mk(["ARTICLE III", "MISCELLANEOUS", "3.27 Affected Financial Institutions. No Loan Party is an Affected Financial Institution and the Borrower has delivered a certificate."]);
    expect(buildTreeLocator({ documentText: doc, candidates: [] }).isCovenantSection!("3.27")).toBe(false);
  });
  it("Events of Default stay in scope even under a 'Financial Ratios' article (a14-26274) and burdensome-agreement titles", () => {
    const doc = mk([
      "ARTICLE VII", "FINANCIAL RATIOS",
      "7.05 Defaults. If any of the following events shall occur, the Lenders may terminate the Commitments.",
      "7.06 Burdensome Agreements. The Borrower may enter into agreements described in the schedule.",
    ]);
    const l = buildTreeLocator({ documentText: doc, candidates: [] });
    expect(l.isCovenantSection!("7.5")).toBe(true);
    expect(l.isCovenantSection!("7.6")).toBe(true);
  });
});

describe("item-level prohibition keeps an item in scope (a14-26274 negative pledge)", () => {
  it("a 'shall not, and shall not permit' item in a non-covenant section is not dropped", () => {
    process.env.CLF_SCOPE_COVENANT = "1";
    const loc = { candidateSection: () => null, citationSection: () => null, isCovenantSection: () => false };
    expect(outOfCovenantScope(loc, "9.1", "notwithstanding the foregoing, the Borrower shall not, and shall not permit any of its Subsidiaries to, secure pursuant to the Collateral Documents any Debt")).toBe(false);
    expect(outOfCovenantScope(loc, "9.1", "Each Lender hereby irrevocably appoints the Administrative Agent as its agent.")).toBe(true);
  });
});
