/**
 * Generalization proof: the covenant-intelligence rules are written
 * against drafting shapes, not against any one document.
 *
 * These tests deliberately use NO Quila-shaped text — different agreement
 * types (credit agreement, not indenture), different section numbering
 * (§ symbol, Article VII, numeric clauses), different heading casing,
 * different currency prefixes, and different prohibition phrasings
 * ("will not", "Neither … shall"). A rule that only works on the
 * document it was debugged against fails here.
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";

function node(
  nodeId: string,
  sectionRef: string,
  heading: string,
  charStart: number,
  charEnd: number,
): StructuralNodeRecord {
  return {
    nodeId,
    sourceId: "test:general",
    nodeType: "SECTION",
    sectionRef,
    heading,
    charStart,
    charEnd,
    ambiguous: false,
  };
}

function spanOf(text: string, needle: string, from = 0): { start: number; end: number } {
  const start = text.indexOf(needle, from);
  if (start < 0) throw new Error(`needle not found: ${needle}`);
  return { start, end: start + needle.length };
}

function analyze(
  excerpt: string,
  heading: string,
  families: string[],
  candidateId = "c-general",
) {
  return analyzeProvision({
    sourceId: "test:general",
    documentTitle: "Test Agreement",
    candidate: {
      candidateId,
      sourceId: "test:general",
      nodeId: "n-general",
      families,
      signals: [],
      excerpt,
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 8,
    },
    definitions: [],
    structuralNodes: [node("n-general", "7.02", heading, 0, 100)],
  });
}

describe("generalization: agreement types and drafting shapes", () => {
  it("credit-agreement Negative Pledge (Section 7.02, Borrower) reads as a Liens prohibition", () => {
    const a = analyze(
      "Section 7.02 Negative Pledge. The Borrower shall not create, incur or assume any Lien upon any of its property except Permitted Liens.",
      "Negative Pledge",
      ["LIENS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
    expect(a.restriction ?? "").toMatch(/shall not/i);
  });

  it("'will not' is a prohibition, not an obligation", () => {
    const a = analyze(
      "The Company will not, and will not permit any Subsidiary to, incur Indebtedness except Permitted Indebtedness.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });

  it("'Neither X nor Y shall' is a prohibition with no 'not'", () => {
    const a = analyze(
      "Neither the Issuer nor any Restricted Subsidiary shall create any Lien upon any of its assets except Permitted Liens.",
      "Limitation on Liens",
      ["LIENS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
    expect(a.posture).not.toBe("OBLIGATION");
  });

  it("all-caps heading still classifies", () => {
    const a = analyze(
      "THE ISSUER SHALL NOT INCUR INDEBTEDNESS EXCEPT PERMITTED INDEBTEDNESS.",
      "LIMITATION ON INDEBTEDNESS",
      ["INDEBTEDNESS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });

  it("restricted-payments covenant reads as a prohibition", () => {
    const a = analyze(
      "Section 9.03 Limitation on Restricted Payments. The Company shall not make any Restricted Payment except as permitted by this Section 9.03.",
      "Limitation on Restricted Payments",
      ["RESTRICTED_PAYMENTS"],
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });
});

describe("generalization: clause markers and currency forms", () => {
  it("roman-numeral greater-of limbs stay inside their basket", () => {
    const a = analyze(
      "The Borrower shall not incur Indebtedness except: " +
        "(a) Indebtedness under the Credit Agreement in an aggregate principal amount not to exceed $200,000,000; " +
        "(b) Indebtedness in an aggregate principal amount not to exceed the greater of (i) $25,000,000 and (ii) 15% of Consolidated EBITDA; " +
        "(c) Indebtedness evidenced by the Notes.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.permissions).toHaveLength(3);
    expect(a.permissions[1]).toContain("$25,000,000");
    expect(a.permissions[1]).toContain("15% of Consolidated EBITDA");
    expect(a.permissions[1]).not.toContain("(c)");
  });

  it("numeric clause markers (1)/(2) split like letter clauses", () => {
    const a = analyze(
      "The Borrower shall not incur Indebtedness except: " +
        "(1) Indebtedness under the Credit Agreement; " +
        "(2) Indebtedness in an aggregate principal amount not to exceed $40,000,000.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.permissions).toHaveLength(2);
    expect(a.permissions[1]).toContain("$40,000,000");
  });

  it("US$ prefix survives in a basket clause", () => {
    const a = analyze(
      "The Issuer shall not incur Indebtedness except: (a) Indebtedness in an aggregate principal amount not to exceed US$100 million.",
      "Limitation on Indebtedness",
      ["INDEBTEDNESS"],
    );
    expect(a.permissions).toHaveLength(1);
    expect(a.permissions[0]).toContain("US$100 million");
  });
});

describe("generalization: family synonyms", () => {
  it("'Limitation on Debt' / 'shall not incur Debt' classifies as INDEBTEDNESS", () => {
    const families = classifyFamiliesFromText(
      "The Issuer shall not incur any Debt except Permitted Debt.",
      "Limitation on Debt",
    );
    expect(families).toContain("INDEBTEDNESS");
  });

  it("'Junior Debt Prepayments' does NOT gain INDEBTEDNESS (precision guard)", () => {
    const families = classifyFamiliesFromText(
      "The Issuer shall not prepay any Junior Debt except as permitted by this Section.",
      "Junior Debt Prepayments",
    );
    expect(families).toContain("JUNIOR_DEBT_PREPAYMENTS");
    expect(families).not.toContain("INDEBTEDNESS");
  });
});

describe("generalization: TOC shapes", () => {
  it("§-symbol body section is operative, not TOC", () => {
    const text = "§ 5.24 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except Permitted Indebtedness.";
    const body = spanOf(text, "§ 5.24");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-524", "5.24", "Limitation on Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("ARTICLE-style dotted-leader TOC entry is suppressed", () => {
    const text = [
      "ARTICLE 6  COVENANTS  ..........  42",
      "Section 6.01 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except Permitted Indebtedness.",
      "",
    ].join("\n");
    const toc = spanOf(text, "ARTICLE 6");
    const body = spanOf(text, "Section 6.01");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-6", "6", "Covenants", toc.start, toc.end),
      node("body-601", "6.01", "Limitation on Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-601");
  });

  it("roman-numeral bare TOC entry (VII. … 35) is suppressed", () => {
    const text = ["VII. Limitation on Indebtedness 35", ""].join("\n");
    const toc = spanOf(text, "VII. Limitation on Indebtedness 35");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-vii", "7", "Limitation on Indebtedness", toc.start, toc.end),
    ]);
    expect(candidates).toHaveLength(0);
  });
});
