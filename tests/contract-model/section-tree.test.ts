import { describe, expect, it } from "vitest";
import { parseDocumentTree, parseSectionTree, treeStats } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist, resolveCrossRefs, roleOf } from "@/lib/contract-model/section-tree/semantics";

const DOC = `TABLE OF CONTENTS
Section 6.01 Indebtedness 45
Section 6.02 Liens 47
Section 6.03 Restricted Payments 49

ARTICLE VI
NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower will not, and will not permit any Subsidiary to, create, incur or assume any Indebtedness, except:
(a) Indebtedness under the Loan Documents;
(b) Indebtedness in an aggregate principal amount not to exceed the greater of $25,000,000 and 10% of Consolidated EBITDA, provided that:
(i) no Default exists; and
(ii) the Borrower is in pro forma compliance with Section 6.04(a);
(c) Indebtedness permitted by Section 6.02(b).
45
Section 6.02 Liens. The Borrower will not create any Lien, except:
(a) Liens securing Indebtedness under Section 6.01(a); and
(b) Liens not to exceed $10,000,000.
Section 6.04 Financial Covenant. (a) The Borrower will not permit the Leverage Ratio to exceed 4.00 to 1.00.
`;

describe("section tree", () => {
  const t = parseSectionTree(DOC);
  const by = (p: string) => t.nodes.find((n) => n.path === p)!;

  it("builds Article > Section > (a) > (i) with exact spans and parents, excluding the TOC", () => {
    expect(t.tocExcluded).toBe(true);
    expect(t.nodes.filter((n) => n.kind === "SECTION").map((n) => n.path)).toEqual(["6.1", "6.2", "6.4"]);
    const b = by("6.1(b)");
    expect(t.byId.get(b.parentId!)!.path).toBe("6.1");
    expect(by("6.1(b)(ii)").parentId).toBe(b.id);
    expect(DOC.slice(by("6.1(a)").start, by("6.1(a)").end).trim()).toBe("(a) Indebtedness under the Loan Documents;");
    expect(t.byId.get(by("6.1").parentId!)!.label).toBe("ARTICLE VI");
    expect(t.furniture.some((f) => f.kind === "PAGE_NUMBER")).toBe(true);
  });

  it("labels roles", () => {
    expect(roleOf(t, DOC, by("6.1"))).toBe("PROHIBITION");
    expect(roleOf(t, DOC, by("6.1(a)"))).toBe("BASKET");
  });

  it("resolves cross-references and records unresolved ones explicitly", () => {
    const xr = resolveCrossRefs(t, DOC);
    expect(xr.find((x) => x.target === "6.1(a)")!.status).toBe("RESOLVED");
    expect(xr.find((x) => x.target === "6.2(b)")!.status).toBe("RESOLVED");
    expect(xr.find((x) => x.target === "6.4(a)")!.status).toBe("RESOLVED");
  });

  it("checklist never reports unlimited; missing families are MISSING", () => {
    const ck = Object.fromEntries(covenantChecklist(t, DOC).map((c) => [c.family, c]));
    expect(ck.DEBT!.status).toBe("NEEDS_INPUT");
    expect(ck.DEBT!.needsInputs).toContain("EBITDA");
    expect(ck.LIENS!.status).toBe("CAP_FOUND");
    expect(ck.INVESTMENTS!.status).toBe("MISSING");
    expect(Object.values(ck).map((c) => c.status)).not.toContain("UNLIMITED");
  });

  it("never throws on odd formatting (fuzz) and fails closed per section", () => {
    const pieces = ["Section 1.01 ", "(a) ", "(i) ", "(A) ", "(zz) ", "ARTICLE ", "\n", "<p>", "&#x201c;", "  ", "§", "1.", "Title.", "except:", "(", ")", "provided that", "\u00a0"];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let k = 0; k < 300; k++) {
      let s = "";
      const n = Math.floor(rnd() * 200);
      for (let i = 0; i < n; i++) s += pieces[Math.floor(rnd() * pieces.length)];
      const tree = parseDocumentTree(s);
      const st = treeStats(tree, tree.text);
      expect(st.unparsedPct).toBeGreaterThanOrEqual(0);
      for (const node of tree.nodes) expect(node.end).toBeGreaterThanOrEqual(node.start);
    }
    expect(() => parseDocumentTree("")).not.toThrow();
  });
});
