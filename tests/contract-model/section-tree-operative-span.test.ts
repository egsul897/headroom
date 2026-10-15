import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "../../lib/contract-model/section-tree/parse";
import { covenantChecklist } from "../../lib/contract-model/section-tree/semantics";

const check = (doc: string, family: string) => {
  const t = parseDocumentTree(doc);
  return covenantChecklist(t, t.text).find((c) => c.family === family)!;
};

// An amendment with no numbered sections: the restated covenant sits in ROOT text.
const AMENDMENT_PREFIX = `FIRST AMENDMENT TO CREDIT AGREEMENT

This First Amendment is entered into among the Borrower, the Lenders and the Administrative Agent.

The Borrower shall pay to the Administrative Agent an amendment fee of $25,000,000 on the date hereof.

Section 7.1 of the Credit Agreement is hereby amended and restated in its entirety to read as follows:
“7.1 Indebtedness. The Borrower will not, and will not permit any Subsidiary to, create, incur or assume any Indebtedness, except Indebtedness under the Loan Documents and Indebtedness existing on the Closing Date.”
`;

describe("operative covenant span (#375)", () => {
  it("(a) restated debt covenant with no cap plus an unrelated $25M fee is NOT CAP_FOUND", () => {
    const c = check(AMENDMENT_PREFIX + "\nThis Amendment shall be governed by the laws of the State of New York.\n", "DEBT");
    expect(c.status).not.toBe("CAP_FOUND");
    expect(c.parts.fixedCap).toBe(false);
    expect(c.spans?.length).toBe(1);
    expect(c.spans![0]!.path).not.toBe("ROOT");
  });

  it("(b) restated covenant with a real monetary ceiling is CAP_FOUND, bound to the quoted span", () => {
    const doc = AMENDMENT_PREFIX.replace(
      "and Indebtedness existing on the Closing Date.",
      "and other Indebtedness in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.",
    );
    const c = check(doc, "DEBT");
    expect(c.status).toBe("CAP_FOUND");
    const span = c.spans![0]!;
    const t = parseDocumentTree(doc).text;
    expect(t.slice(span.start, span.end)).toContain("$50,000,000");
    expect(t.slice(span.start, span.end)).not.toContain("$25,000,000");
    expect(span.resolved).toBe(true);
  });
});
