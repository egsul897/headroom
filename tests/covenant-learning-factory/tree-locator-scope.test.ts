import { describe, expect, it } from "vitest";
import { buildTreeLocator } from "@/lib/covenant-learning-factory/sweep/tree-locator";

const credit = `ARTICLE I DEFINITIONS AND ACCOUNTING TERMS
Section 1.01 Defined Terms . As used in this Agreement, "Liens" means any mortgage, pledge or security interest on any property of any Person whatsoever.
Section 1.04 Accounting Terms . All accounting terms not specifically defined herein shall be construed in accordance with GAAP consistently applied.
ARTICLE VII NEGATIVE COVENANTS
Section 7.01 Liens . The Borrower shall not create, incur, assume or suffer to exist any Liens upon any of its property, except Liens existing on the date hereof as set forth in Section 1.01 and Section 1.04.
`;
const bylaws = `ARTICLE II STOCKHOLDERS
Section 2.01 Annual Meeting . The annual meeting of stockholders shall be held at such date and time as the Board of Directors shall designate from time to time.
Section 2.02 Notice . Except as otherwise provided by law, written notice of each meeting shall be given not less than ten nor more than sixty days before the meeting.
`;

describe("covenant scope", () => {
  it("definitions and accounting-terms sections are not covenant sections", () => {
    const loc = buildTreeLocator({ documentText: credit, candidates: [] });
    expect(loc.isCovenantSection!("7.1")).toBe(true);
    expect(loc.isCovenantSection!("1.1")).toBe(false);
    expect(loc.isCovenantSection!("1.4")).toBe(false);
  });
  it("a document with no covenant family has no covenant sections", () => {
    const loc = buildTreeLocator({ documentText: bylaws, candidates: [] });
    expect(loc.isCovenantSection!("2.1")).toBe(false);
    expect(loc.isCovenantSection!("2.2")).toBe(false);
  });
});
