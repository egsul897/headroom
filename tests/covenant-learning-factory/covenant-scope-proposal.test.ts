import { afterEach, describe, expect, it } from "vitest";
import { conditionBound, outOfCovenantScope } from "../../lib/covenant-learning-factory/sweep/self-check";
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
