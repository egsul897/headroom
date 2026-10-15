import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "../../lib/contract-model/section-tree/parse";
import { covenantChecklist } from "../../lib/contract-model/section-tree/semantics";

const status = (doc: string, family: string) => {
  const t = parseDocumentTree(doc);
  return covenantChecklist(t, t.text).find((c) => c.family === family)!.status;
};
const FOUND = ["CAP_FOUND", "NEEDS_INPUT", "CONDITIONS_LIMITED"];

describe("enumerated-item negation bound to its structural parent (#377)", () => {
  it("(c) a negative list followed by an affirmative debt permission gives no false DEBT restriction", () => {
    const doc = `ARTICLE V
COVENANTS

Section 5.1 Separateness. The Company shall not, without the consent of the Member, do any of the following:
(a) amend its certificate of formation;
(b) change its fiscal year.

Section 5.2 Financing. The Company may, from time to time, do any of the following:
(a) incur Indebtedness under the Credit Facility;
(b) incur Indebtedness owed to the Member.
`;
    expect(FOUND).not.toContain(status(doc, "DEBT"));
  });

  it("(d) a valid obligor-bound negative enumerated list is FOUND", () => {
    const doc = `ARTICLE V
COVENANTS

Section 5.1 Separateness. The Company shall not, without the consent of the Member, do any of the following:
(a) incur any Indebtedness other than trade payables in the ordinary course;
(b) change its fiscal year.
`;
    expect(FOUND).toContain(status(doc, "DEBT"));
  });

  it("(e) a non-obligor negative list gives no false restriction", () => {
    const doc = `ARTICLE V
AGENCY

Section 5.1 Agent Duties. The Administrative Agent shall not be obligated to do any of the following:
(a) incur any Indebtedness on behalf of any Lender;
(b) make any Investment for the account of any Lender.
`;
    expect(FOUND).not.toContain(status(doc, "DEBT"));
    expect(FOUND).not.toContain(status(doc, "INVESTMENTS"));
  });
});
