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

describe("nesting regressions (reviewer #365)", () => {
  const paths = (text: string, sec: string) => {
    const t = parseSectionTree(text);
    const s = t.nodes.find((n) => n.kind === "SECTION" && n.sectionNumber === sec)!;
    const out: string[] = [];
    const walk = (id: string) => { const n = t.byId.get(id)!; out.push(n.path); n.childIds.forEach(walk); };
    s.childIds.forEach(walk);
    return { s, out };
  };

  it("ef20064499 7.01: (b)'s (1)-(n) list nests, (3)'s proviso (a)/(b) nest under (3), inline (c)-(f) inside (8) do not escape, and the post-list (a)-(c) restart", () => {
    const text = [
      "Section 7.01 Indebtedness .", "",
      "(a) Incur any Indebtedness; provided that the Borrower may incur Indebtedness.", "",
      "(b) The provisions of Section 7.01(a) will not prohibit the following:", "",
      "(1) Indebtedness under the Loan Documents;", "",
      "(2) Guarantees by the Borrower;", "",
      "(3) Indebtedness of the Borrower to any Restricted Subsidiary; provided , however , that:", "",
      "(a) any subsequent issuance of Capital Stock, and", "",
      "(b) any sale of any such Indebtedness;", "",
      "(4) Swap Obligations;", "",
      "(5) Indebtedness in respect of (a) workers' compensation claims, (b) bankers' acceptances,",
      "(c) customer deposits; (d) letters of credit, (e) Cash Management Agreements; and",
      "(f) Settlement Indebtedness;", "",
      "(6) Indebtedness arising from guarantees.", "",
      "For purposes of determining compliance with this Section 7.01 :", "",
      "(a) in the event that any item meets more than one type;", "",
      "(b) additionally, subject to clause (c) below, reclassification; and", "",
      "(c) all Indebtedness outstanding on the Closing Date.", "",
      "Section 7.02 Liens .", "", "(a) Create any Lien.",
    ].join("\n");
    const { s, out } = paths(text, "7.1");
    expect(s.title).toBe("Indebtedness");
    expect(out).toEqual([
      "7.1(a)", "7.1(b)", "7.1(b)(1)", "7.1(b)(2)", "7.1(b)(3)", "7.1(b)(3)(a)", "7.1(b)(3)(b)",
      "7.1(b)(4)", "7.1(b)(5)", "7.1(b)(6)", "7.1[2](a)", "7.1[2](b)", "7.1[2](c)",
    ]);
  });

  it("mrvi 6.07: clause (a) is not lost after a page number between heading and body", () => {
    const text = "Section 6.07  Restricted Payments; Certain Payments of Indebtedness  .\n    162\n      \n\n  (a)  The Borrower will not make any Restricted Payment, except:\n\n  (i)  the Borrower may make Restricted Payments to any Restricted Subsidiary;\n\n  (ii)  Holdings may declare dividends;\n\n  (b)  Holdings will not make any payment on Junior Financing, except:\n\n  (i)  regularly scheduled interest;\n\nSection 6.08 Transactions with Affiliates.\n";
    const { out } = paths(text, "6.7");
    expect(out).toEqual(["6.7(a)", "6.7(a)(i)", "6.7(a)(ii)", "6.7(b)", "6.7(b)(i)"]);
  });

  it("rbc 7.05: page-number-merged (4) is found, proviso (a)-(c) is not nested under (3), second list restarts without duplicated (b)/(c)", () => {
    const text = [
      "Section 7.05 Restricted Payments.  Directly or indirectly:  (1) declare or pay any dividend;",
      "(2) purchase any Equity Interests;",
      "(3) make any principal payment on Subordinated Indebtedness; or", "",
      " 161 (4) make any Restricted Investment; (all such payments being collectively referred to as \u201cRestricted Payments\u201d), unless, at the time of such Restricted Payment: (a) no Specified Event of Default shall have occurred; (b) [reserved]; and (c) such Restricted Payment is less than the sum of (i) Excess Cash Flow plus (ii) equity proceeds. This Section 7.05 will not prohibit: (1) the payment of any dividend within 60 days;",
      "(2) the redemption of Equity Interests;",
      "(3) [reserved].", "",
      "Section 7.06 Burdensome Agreements.",
    ].join("\n");
    const { out } = paths(text, "7.5");
    expect(out.filter((p) => !/\(i+\)$/.test(p))).toEqual([
      "7.5(1)", "7.5(2)", "7.5(3)", "7.5(4)", "7.5[2](a)", "7.5[2](b)", "7.5[2](c)", "7.5[3](1)", "7.5[3](2)", "7.5[3](3)",
    ]);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("tree mode flag (#365 note 4)", () => {
  it("agree (default) fails closed on tree/declared disagreement; override relabels", async () => {
    const { strictCandidateMatch } = await import("@/lib/covenant-learning-factory/sweep/self-check");
    const text = "the debt to capitalization ratio shall not exceed 0.60 to 1.00 as of the last day of any fiscal quarter";
    const cand = { excerpt: text, sectionRef: "Section 6.07", family: "RATIO_BASED_PERMISSIONS", treeSection: "6.7" };
    const basket = { cite: text, sectionRef: "Section 7.03", family: "OTHER", treeSection: "6.7" };
    delete process.env.CLF_SCOREBOARD_TREE_MODE;
    expect(strictCandidateMatch(cand, basket)).toBe(false);
    process.env.CLF_SCOREBOARD_TREE_MODE = "override";
    expect(strictCandidateMatch(cand, basket)).toBe(true);
    delete process.env.CLF_SCOREBOARD_TREE_MODE;
  });
});

describe("acn under-parse (#365 note 7)", () => {
  it("a heading on the line after a sentence-ending period is a line-start heading, not a mid-sentence reference", () => {
    const body = " The Borrower shall deliver to the Administrative Agent for distribution to each Lender, in form and detail satisfactory to the Administrative Agent, the items described in this Section.";
    const text = `ARTICLE VI. AFFIRMATIVE COVENANTS\n  6.01    Financial Statements.   ${body}\n  6.02    Certificates; Other Information.   ${body}\n  6.03    Notices.   ${body}\n`;
    const t = parseSectionTree(text);
    expect(t.nodes.filter((n) => n.kind === "SECTION").map((n) => n.sectionNumber)).toEqual(["6.1", "6.2", "6.3"]);
  });
});

describe("reviewer adversarial (#365 PASS_WITH_NOTES)", () => {
  it("(1) located candidate vs AMBIGUOUS basket (duplicated clause) is rejected, never falls back to the declared section", async () => {
    const { strictCandidateMatch } = await import("@/lib/covenant-learning-factory/sweep/self-check");
    const { buildTreeLocator, AMBIGUOUS } = await import("@/lib/covenant-learning-factory/sweep/tree-locator");
    const dup = "Indebtedness in an aggregate principal amount not to exceed the greater of $50,000,000 and 25% of Consolidated EBITDA";
    const filler = " The Borrower will comply with this Section in all material respects at all times during the term of this Agreement.";
    const doc = `ARTICLE VI\nNEGATIVE COVENANTS\n\nSection 6.01 Indebtedness. The Borrower will not incur any Indebtedness, except:${filler}\n(a) ${dup};\n(b) purchase money debt;\n\nSection 7.01 Liens. The Borrower will not create any Lien, except:${filler}\n(a) Liens securing ${dup};\n(b) statutory liens.\n`;
    const loc = buildTreeLocator({ documentText: doc, candidates: [] });
    const candText = `Liens securing ${dup}`;
    const candTree = loc.candidateSection({ candidateId: "c", sourceId: "s", family: "LIENS", sectionRef: null, excerpt: candText } as never);
    const basketTree = loc.citationSection(dup);
    expect(candTree).toBe("7.1");
    expect(basketTree).toBe(AMBIGUOUS);
    const norm = (t: string) => t.toLowerCase();
    expect(
      strictCandidateMatch(
        { excerpt: norm(candText), sectionRef: null, family: "LIENS", treeSection: candTree },
        { cite: norm(dup), sectionRef: "Section 7.01", family: "LIENS", treeSection: basketTree },
      ),
    ).toBe(false);
  });
  it("(2) a family-OTHER basket that is only a fragment of a proviso does not count as a match", async () => {
    const { strictCandidateMatch } = await import("@/lib/covenant-learning-factory/sweep/self-check");
    const proviso = "provided that the aggregate amount of all such investments made in reliance on this clause shall not exceed the greater of $10,000,000 and 5% of total assets at any time outstanding";
    const fragment = proviso.slice(0, 90);
    const c = { excerpt: proviso, sectionRef: "Section 6.04", family: "INVESTMENTS" };
    expect(strictCandidateMatch(c, { cite: fragment, sectionRef: "Section 6.04", family: "OTHER" })).toBe(false);
    expect(strictCandidateMatch(c, { cite: proviso, sectionRef: "Section 6.04", family: "OTHER" })).toBe(true);
    expect(strictCandidateMatch(c, { cite: fragment, sectionRef: "Section 6.04", family: "INVESTMENTS" })).toBe(true);
  });
});

describe("covenant family classifier (general signals)", async () => {
  const { classifyCovenantFamily } = await import("@/lib/contract-model/section-tree/family-classifier");
  it("classifies by lead-in prohibition object, not heading alone", () => {
    expect(classifyCovenantFamily({ title: "Liens", parentTitle: "NEGATIVE COVENANTS", leadIn: " No Loan Party will directly or indirectly create, incur, assume or suffer to exist any Lien of any kind" }).family).toBe("LIENS");
    expect(classifyCovenantFamily({ title: null, leadIn: "The Borrower will not, directly or indirectly: (i) declare or pay any dividend on its Equity Interests" }).family).toBe("RESTRICTED_PAYMENTS");
    expect(classifyCovenantFamily({ title: "Financial Covenant", leadIn: "The Consolidated Leverage Ratio shall not, as of the last day of any period, be greater than 1.75 to 1.00." }).family).toBe("FINANCIAL_RATIOS");
  });
  it("rejects non-covenant sections that only share words", () => {
    expect(classifyCovenantFamily({ title: "Margin Regulations; Investment Company Act", leadIn: "The Borrower is not engaged and will not engage in the business of extending credit for margin stock" }).family).toBeNull();
    expect(classifyCovenantFamily({ title: "Trustee Not Fiduciary for Holders of Senior Indebtedness", leadIn: "The Trustee shall not be deemed to owe any fiduciary duty to the holders of Senior Indebtedness" }).family).toBeNull();
    expect(classifyCovenantFamily({ title: "Rounding", leadIn: "Any financial ratios required to be maintained by the Borrower shall be calculated by dividing" }).family).toBeNull();
    expect(classifyCovenantFamily({ title: "Use of Proceeds", leadIn: "The Borrower will not use the proceeds of any Advance to purchase or carry any margin stock or to pay dividends" }).family).toBeNull();
  });
  it("a lien securing debt is a lien covenant, not a debt covenant", () => {
    const v = classifyCovenantFamily({ title: "Negative Pledge", parentTitle: "COVENANTS", leadIn: "No Loan Party shall create, assume, or suffer to exist any Lien securing Indebtedness" });
    expect(v.family).toBe("LIENS");
    expect(v.families).not.toContain("DEBT");
  });
});
