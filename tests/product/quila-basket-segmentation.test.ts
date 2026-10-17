/**
 * Fail-before corpus, batch 2: enumerated-basket segmentation.
 *
 * The live Quila output showed §6.01(2)'s baskets "incomplete and mixed
 * together". Root cause in extractPermissions: clauses were cut with
 * /[^;.]{15,220}/ — so a clause stopped at the first "." (the "." in
 * "U.S.$150.0 million" truncated the clause to "...not to exceed U"), at
 * the first ";" (provisos were severed from their basket), and at 220
 * chars (long clauses lost their cap). Letter markers from nested
 * greater-of limbs ((x)/(y)) also leaked into neighbouring clauses.
 *
 * These tests use synthetic indenture-shaped text only.
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
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
    sourceId: "test:quila2",
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

function analyzeDebtBaskets(excerpt: string) {
  return analyzeProvision({
    sourceId: "test:quila2",
    documentTitle: "Test Indenture",
    candidate: {
      candidateId: "c-baskets",
      sourceId: "test:quila2",
      nodeId: "n-baskets",
      families: ["INDEBTEDNESS"],
      signals: [],
      excerpt,
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 8,
    },
    definitions: [],
    structuralNodes: [node("n-baskets", "6.01", "Limitation on Indebtedness", 0, 100)],
  });
}

describe("enumerated-basket segmentation", () => {
  const excerpt =
    "The Issuer shall not incur Indebtedness except: " +
    "(a) Indebtedness under the Credit Facilities in an aggregate principal amount not to exceed U.S.$150.0 million; provided that the Borrower shall have complied with Section 5.01; " +
    "(b) Indebtedness of the Issuer in an aggregate principal amount not to exceed the greater of (x) $50,000,000 and (y) 10.0% of Consolidated EBITDA; " +
    "(c) Indebtedness under the Notes in an aggregate principal amount of U.S.$35,000,000.";

  it("keeps each basket whole: no truncation at U.S., semicolons, or decimals", () => {
    const analysis = analyzeDebtBaskets(excerpt);
    expect(analysis.permissions).toHaveLength(3);
    expect(analysis.permissions[0]).toContain("$150.0 million");
    expect(analysis.permissions[0]).toContain("provided that");
    expect(analysis.permissions[1]).toContain("greater of");
    expect(analysis.permissions[1]).toContain("$50,000,000");
    expect(analysis.permissions[1]).toContain("10.0% of Consolidated EBITDA");
    expect(analysis.permissions[2]).toContain("$35,000,000");
  });

  it("does not mix clauses together", () => {
    const analysis = analyzeDebtBaskets(excerpt);
    expect(analysis.permissions[0]).not.toContain("(b)");
    expect(analysis.permissions[0]).not.toContain("(c)");
    expect(analysis.permissions[1]).not.toContain("(c)");
    expect(analysis.permissions[1]).not.toContain("Credit Facilities");
  });

  it("does not truncate a long basket clause at 220 chars", () => {
    const longClause =
      "The Issuer shall not incur Indebtedness except: " +
      "(a) Indebtedness of the Issuer and its Restricted Subsidiaries under one or more credit facilities, term loans, revolving commitments and other financing arrangements entered into in the ordinary course of business in an aggregate principal amount not to exceed $75,000,000.";
    const analysis = analyzeDebtBaskets(longClause);
    expect(analysis.permissions).toHaveLength(1);
    expect(analysis.permissions[0]).toContain("$75,000,000");
  });
});

describe("bare TOC entries (no 'Section' prefix, no dotted leader)", () => {
  it("drops a bare TOC line when the body section exists", () => {
    const text = [
      "6.05 Limitation on Liens 58",
      "Section 6.05 Limitation on Liens. The Issuer shall not create any Lien except Permitted Liens.",
      "",
    ].join("\n");
    const toc = spanOf(text, "6.05 Limitation on Liens 58");
    const body = spanOf(text, "Section 6.05 Limitation on Liens. The Issuer");
    const candidates = discoverCovenantCandidates("test:quila2", text, [
      node("toc-605", "6.05", "Limitation on Liens", toc.start, toc.end),
      node("body-605", "6.05", "Limitation on Liens", body.start, body.end),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.nodeId).toBe("body-605");
  });

  it("drops a bare TOC-only section entirely", () => {
    const text = ["6.05 Limitation on Liens 58", ""].join("\n");
    const toc = spanOf(text, "6.05 Limitation on Liens 58");
    const candidates = discoverCovenantCandidates("test:quila2", text, [
      node("toc-605", "6.05", "Limitation on Liens", toc.start, toc.end),
    ]);
    expect(candidates).toHaveLength(0);
  });
});
