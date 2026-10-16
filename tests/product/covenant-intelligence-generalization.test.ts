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
import type {
  KnowledgeTaxonomyFamily,
  StructuralNodeRecord,
} from "../../lib/knowledge-factory/types";
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
  families: KnowledgeTaxonomyFamily[],
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

  it("rule 163: multi-line Section-prefixed TOC entry is suppressed (EDGAR splits ref/title/page across lines)", () => {
    // Strata shape: the TOC lists "Section 6.01." / "Indebtedness" /
    // "109" on separate lines. No single line matches the TOC
    // patterns, so the TOC node survived and duplicated the body
    // section (same sectionRef, different excerpt, dedup kept both).
    const text = [
      "Section 6.01.",
      "Indebtedness",
      "109",
      "",
      "Section 6.01. Indebtedness. No Loan Party shall create Indebtedness except Permitted Indebtedness.",
      "",
    ].join("\n");
    const toc = spanOf(text, "Section 6.01.");
    const body = spanOf(text, "Section 6.01. Indebtedness. No Loan Party");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-601", "6.01", "Section 6.01.\nIndebtedness", toc.start, toc.end),
      node("body-601", "6.01", "Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-601");
  });

  it("rule 163: multi-line ARTICLE-level TOC entry is suppressed", () => {
    // Aon shape: "ARTICLE IV" / "CONDITIONS PRECEDENT" / "45" on
    // separate lines. Same multi-line escape as the Section shape.
    const text = [
      "ARTICLE IV",
      "CONDITIONS PRECEDENT",
      "45",
      "",
      "ARTICLE IV CONDITIONS PRECEDENT. The Loans shall not become effective unless the conditions are met.",
      "",
    ].join("\n");
    const toc = spanOf(text, "ARTICLE IV");
    const body = spanOf(text, "ARTICLE IV CONDITIONS PRECEDENT. The Loans");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-4", "4", "ARTICLE IV\nCONDITIONS PRECEDENT", toc.start, toc.end),
      node("body-4", "4", "CONDITIONS PRECEDENT", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-4");
  });

  it("rule 163: TOC-shaped span WITH an operative verb is not suppressed (verb guard)", () => {
    const text = "Section 6.01. Indebtedness 109 The Borrower shall not create Indebtedness except Permitted Indebtedness.";
    const body = spanOf(text, "Section 6.01");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-601", "6.01", "Indebtedness", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("rule 163: article-level TOC LIST is suppressed (Aon shape — many entries, one span)", () => {
    // One TOC article node spans the whole entry list ("Article V
    // ... 48 5.1. ... 48 5.2. ... 49"), so no single-entry shape
    // matches. The entry count (≥3) identifies the TOC block.
    const text = [
      "Article V",
      "REPRESENTATIONS AND WARRANTIES",
      "48",
      "5.1. Corporate Existence and Standing",
      "48",
      "5.2. Authorization and Validity",
      "49",
      "5.3. Compliance with Laws",
      "49",
      "",
      "ARTICLE V REPRESENTATIONS AND WARRANTIES. The Parent represents and warrants that no Default has occurred. The Borrower shall not create Indebtedness except Permitted Indebtedness.",
      "",
    ].join("\n");
    const toc = spanOf(text, "Article V");
    const body = spanOf(text, "ARTICLE V REPRESENTATIONS AND WARRANTIES. The Parent");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("toc-5", "5", "REPRESENTATIONS AND WARRANTIES", toc.start, toc.end),
      node("body-5", "5", "REPRESENTATIONS AND WARRANTIES", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-5");
  });

  it("rule 163: body text with cross-references is not suppressed (entry-count guard)", () => {
    // No operative verb, but the cross-reference pair cannot fake
    // three TOC-list entries, so the body section survives.
    const text =
      "ARTICLE V REPRESENTATIONS AND WARRANTIES. No Default or Event of Default has occurred. " +
      "The representations in Sections 5.6 and 5.18 are true.";
    const body = spanOf(text, "ARTICLE V");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-5", "5", "REPRESENTATIONS AND WARRANTIES", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("rule 164: UNKNOWN gate matches plural heading keywords (COVENANTS, Subsidiaries)", () => {
    // Aon shape: the covenants article heading is plural
    // ("ARTICLE VI COVENANTS") and the excerpt mentions
    // "Subsidiaries". The singular-only gate dropped the entire
    // article while its TOC artifact survived. The amendment
    // cross-reference keeps the discovery score at 2 (the real
    // excerpt's signal) so the test exercises the gate, not the
    // score filter.
    const text =
      "ARTICLE VI COVENANTS. Subject to the Certain Funds Provisions, so long as any Loan shall remain unpaid, " +
      "each Loan Party will maintain, for itself and its Subsidiaries, a system of accounting designed to produce financial statements. " +
      "This Section 6.1 is subject to amendment under Section 8.2.";
    const body = spanOf(text, "ARTICLE VI");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-6", "6", "ARTICLE VI\nCOVENANTS", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("rule 164: UNKNOWN gate still drops a keyword-free administrative section", () => {
    const text =
      "ARTICLE X MISCELLANEOUS. This Agreement may be executed in counterparts. Notices must be sent to the address on file.";
    const body = spanOf(text, "ARTICLE X");
    const candidates = discoverCovenantCandidates("test:general", text, [
      node("body-10", "10", "MISCELLANEOUS", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(0);
  });
});
