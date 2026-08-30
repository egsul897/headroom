/**
 * Phase 3F.1.5.R (Workstream A) - P1-10 rank-stack structural-corruption
 * root-cause fix: permanent adversarial regression coverage for
 * stage-structure.ts's plausibility gate (`isPlausibleTopLevelHeading` /
 * `rejectByPrecedingContext`) and the misattachment it closes.
 *
 * Background: docs/foundation-remediation/01-source-accounting-remediation.json's
 * `p110Q3Determination` documents the mechanism (an in-text citation shaped
 * like a real heading - "...permitted under Section 6.05 Reserved . and
 * subject to...") - previously accepted as a genuine top-level SECTION raw
 * node, corrupting both stage-structure.ts's clause-tree region-slicing and
 * its global rank-based stack pass, truncating the real enclosing section
 * and re-parenting its later lettered clauses under the spurious node. This
 * suite drives the REAL, unmodified production functions
 * (parseDocumentStructure / buildStructuralIndex) end-to-end - never mocked
 * - over every adversarial shape the fix's own charter requires: nested
 * numeric headings, roman numerals, alphabetic clauses, malformed rank
 * jumps, citation-shaped typography, continuation paragraphs, schedules/
 * exhibits, definitions containing heading-like text, repeated section
 * labels, sibling occurrence identity, amendment text, and valid deep
 * nesting - confirming the gate closes the citation-shaped defect WITHOUT
 * regressing any of these legitimate structural shapes.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

function build(documentId: string, text: string): { index: StructuralIndex; nodes: StructuralNode[] } {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  return { index, nodes };
}

function errorsOf(index: StructuralIndex) {
  return index.healthDiagnostics().filter((f) => f.severity === "ERROR");
}

// ---------------------------------------------------------------------------
// 1. Citation-shaped typography - the defect itself, in several real phrasings
// ---------------------------------------------------------------------------
describe("1. typography resembling headings (in-text citations) is rejected across every documented citation-signal phrase, never just the one known fixture", () => {
  const signalPhrases = ["under", "pursuant to", "referred to in", "as defined in", "set forth in", "described in", "specified in", "contemplated by", "required by", "governed by", "in accordance with", "subject to"];

  it.each(signalPhrases)("citation phrase %j: the false-positive 'Section 6.05 Reserved .' match is never accepted as a raw node, and the real section's own later lettered clauses attach correctly", (phrase) => {
    const text =
      `ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness, except as permitted ${phrase} Section 6.05 Reserved . and subject to the following exceptions: ` +
      "(a) Indebtedness existing on the Closing Date; " +
      "(b) intercompany Indebtedness. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const { index, nodes } = build(`citation-phrase-${phrase.replace(/\s+/g, "-")}`, text);
    expect(nodes.some((n) => n.sectionRef === "6.05"), `phrase ${JSON.stringify(phrase)} must not let the spurious 'Section 6.05' match through`).toBe(false);
    const s601 = index.resolveUniqueNodeByRef(`citation-phrase-${phrase.replace(/\s+/g, "-")}`, "6.01");
    expect(s601.status).toBe("UNIQUE");
    if (s601.status !== "UNIQUE") return;
    expect(index.getChildren(s601.node.nodeId).map((c) => c.sectionRef)).toEqual(["6.01(a)", "6.01(b)"]);
    expect(errorsOf(index)).toHaveLength(0);
  });

  it("a citation-shaped ARTICLE reference (the ALL-CAPS title shape ARTICLE_PATTERNS itself requires, immediately preceded by 'set forth in') is also rejected - the gate is not SECTION-specific", () => {
    // ARTICLE_PATTERNS[0] requires either a real end-of-string or a new
    // capitalized sentence immediately after the ALL-CAPS title to match at
    // all - this in-text citation is deliberately followed by a real new
    // sentence ("Such reference...") so it satisfies the pattern's own shape
    // exactly like a real heading would, isolating the test to the
    // preceding-context gate alone.
    const text =
      "Compliance shall be measured as set forth in ARTICLE VI COVENANTS. Such reference is illustrative only, not a genuine heading in this document.\n\n" +
      "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness . Real covenant text.";
    const { nodes } = build("citation-shaped-article", text);
    const articles = nodes.filter((n) => n.nodeType === "ARTICLE");
    expect(articles).toHaveLength(1);
    expect(articles[0]!.charStart).toBe(text.lastIndexOf("ARTICLE VI COVENANTS"));
  });
});

// ---------------------------------------------------------------------------
// 2. Nested numeric headings, roman numerals, alphabetic clauses, valid deep nesting
// ---------------------------------------------------------------------------
describe("2. legitimate structural shapes are completely unaffected by the gate", () => {
  it("nested decimal SECTION numbering under an ARTICLE, with no citation anywhere, is fully preserved", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Real text one.

Section 6.02 Liens . Real text two.

Section 6.03 Restricted Payments . Real text three.
`.trim();
    const { index } = build("nested-numeric", text);
    const article = index.resolveUniqueNodeByRef("nested-numeric", "VI");
    expect(article.status).toBe("UNIQUE");
    if (article.status !== "UNIQUE") return;
    expect(index.getChildren(article.node.nodeId).map((c) => c.sectionRef)).toEqual(["6.01", "6.02", "6.03"]);
    expect(errorsOf(index)).toHaveLength(0);
  });

  it("roman-numeral ARTICLE headings (I, II, ... VI) are unaffected", () => {
    const text = `
ARTICLE I DEFINITIONS

Section 1.01 Certain Defined Terms . Real text.

ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Real text.
`.trim();
    const { nodes } = build("roman-articles", text);
    const articleRefs = nodes.filter((n) => n.nodeType === "ARTICLE").map((n) => n.sectionRef);
    expect(articleRefs).toEqual(["I", "VI"]);
  });

  it("alphabetic clauses ((a)/(b)/(c), including uppercase (A)/(B) at a deeper level) attach correctly with no citation in play", () => {
    const text = "Section 6.01 Indebtedness . Neither party shall incur Indebtedness except: (a) ordinary trade payables; (b) purchase money debt, in each case: (A) not exceeding $1,000,000; (B) incurred in the ordinary course.";
    const { index } = build("alpha-clauses", text);
    const s601 = index.resolveUniqueNodeByRef("alpha-clauses", "6.01");
    expect(s601.status).toBe("UNIQUE");
    if (s601.status !== "UNIQUE") return;
    expect(index.getChildren(s601.node.nodeId).map((c) => c.sectionRef)).toEqual(["6.01(a)", "6.01(b)"]);
    const b = index.resolveUniqueNodeByRef("alpha-clauses", "6.01(b)");
    expect(b.status).toBe("UNIQUE");
    if (b.status !== "UNIQUE") return;
    expect(index.getChildren(b.node.nodeId).map((c) => c.sectionRef)).toEqual(["6.01(b)(A)", "6.01(b)(B)"]);
  });

  it("valid deep nesting (ARTICLE -> SECTION -> SUBSECTION -> CLAUSE -> SUBCLAUSE) round-trips through the gate untouched", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except: (a) Indebtedness permitted under this Agreement, including: (i) Indebtedness described below: (A) Indebtedness incurred to finance capital expenditures, subject to: (1) an aggregate cap of $5,000,000; (2) a maturity of no more than five years.
`.trim();
    const { nodes } = build("deep-nesting", text);
    const byType = new Map<string, number>();
    for (const n of nodes) byType.set(n.nodeType, (byType.get(n.nodeType) ?? 0) + 1);
    expect(byType.get("ARTICLE")).toBe(1);
    expect(byType.get("SECTION")).toBe(1);
    expect(byType.get("SUBSECTION")).toBe(1);
    expect(byType.get("CLAUSE")).toBe(1);
    // (A) itself is depth 3 (SUBCLAUSE), and (1)/(2) nest one level deeper
    // still under (A) - clause-hierarchy.ts's own documented clamp (no
    // first-class node type beyond SUBCLAUSE) represents any depth past 2
    // as SUBCLAUSE too, so 3 total: (A), (1), (2).
    expect(byType.get("SUBCLAUSE")).toBe(3);
    const deepest = nodes.find((n) => n.sectionRef === "6.01(a)(i)(A)(1)");
    expect(deepest).toBeDefined();
  });

  it("continuation paragraphs (a section's own prose spans multiple blank-line-separated paragraphs, with no new heading in between) stay under the SAME real section, never split", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.

This paragraph continues Section 6.01's own prose after a blank line, with no new heading of its own - a real, common drafting shape.

A third continuation paragraph, still part of 6.01's own body text.

Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.
`.trim();
    const { index, nodes } = build("continuation-paragraphs", text);
    const sections = nodes.filter((n) => n.nodeType === "SECTION");
    expect(sections.map((n) => n.sectionRef)).toEqual(["6.01", "6.02"]);
    const s601 = sections[0]!;
    expect(s601.charEnd).toBe(sections[1]!.charStart);
    expect(index.getNodeText(s601.nodeId, "OWN")).toContain("third continuation paragraph");
  });
});

// ---------------------------------------------------------------------------
// 3. Malformed rank jumps - the gate must not interfere with (nor paper over) this separate, pre-existing, out-of-scope defect
// ---------------------------------------------------------------------------
describe("3. malformed rank jumps (a lettered clause directly under an ARTICLE, skipping SECTION) are unaffected by the plausibility gate - this is Q5's own separate, already-diagnosed finding, not something P1-10's fix touches", () => {
  it("a lettered clause directly under an ARTICLE (no enclosing SECTION at all) still produces no node for the clause - same behavior as before this fix, not a regression the gate introduces", () => {
    const text = `
ARTICLE VI COVENANTS
(a) a lettered clause directly under the ARTICLE, skipping SECTION entirely.
(b) a second one, same malformed nesting.

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness under normal, well-formed hierarchy.
`.trim();
    const { index, nodes } = build("malformed-rank-jump", text);
    expect(nodes.some((n) => n.sectionRef.startsWith("VI(") || n.sectionRef === "(a)")).toBe(false);
    const s601 = index.resolveUniqueNodeByRef("malformed-rank-jump", "6.01");
    expect(s601.status).toBe("UNIQUE");
  });
});

// ---------------------------------------------------------------------------
// 4. Schedules/exhibits and definitions containing heading-like text
// ---------------------------------------------------------------------------
describe("4. schedules/exhibits and definitions containing heading-shaped text never create spurious nodes", () => {
  it("a cross-reference to a Schedule that itself contains a heading-shaped citation to a real Section is rejected by the gate, never corrupting the real section it cites", () => {
    const text =
      "Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Indebtedness of the type set forth in Section 6.05 Reserved . and identified on Schedule 6.01 attached hereto. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const { nodes, index } = build("schedule-citation", text);
    expect(nodes.some((n) => n.sectionRef === "6.05")).toBe(false);
    expect(errorsOf(index)).toHaveLength(0);
  });

  it("a defined term whose own definition text contains a heading-shaped in-text citation does not spawn a spurious node", () => {
    const text =
      '"Applicable Margin" means, as of any date, the rate per annum set forth in Section 6.05 Reserved . opposite the then-applicable Leverage Ratio level. ' +
      "Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const { nodes } = build("definition-with-heading-text", text);
    expect(nodes.some((n) => n.sectionRef === "6.05")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Repeated section labels, sibling occurrence identity, amendment text
// ---------------------------------------------------------------------------
describe("5. genuine repeated/ambiguous section labels and amendment-quoted text are still fully preserved - the gate only rejects CITATION-shaped matches, never a real repeated heading", () => {
  it("a genuinely repeated section label (two real, paragraph-separated, non-citation headings sharing the same number) still resolves AMBIGUOUS - never silently collapsed by the gate", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . First real physical occurrence, its own paragraph.

Section 6.01 Indebtedness . A second real physical occurrence (a genuine duplicate label, e.g. a table-of-contents-style repeat), its own paragraph too.
`.trim();
    const { index } = build("genuine-repeated-label", text);
    const resolution = index.resolveUniqueNodeByRef("genuine-repeated-label", "6.01");
    expect(resolution.status).toBe("AMBIGUOUS");
    if (resolution.status === "AMBIGUOUS") expect(resolution.candidates).toHaveLength(2);
  });

  it("amendment-quoted text ('Section 6.04 is hereby amended and restated to read as follows: Section 6.04 Limitation on Distributions . New text.') still produces a real second occurrence - 'to read as follows:' is not a citation-signal phrase, so the amendment's own quoted heading is correctly accepted", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Original text before the amendment.

Section 6.20 Amendments . Section 6.04 is hereby amended and restated in its entirety to read as follows: Section 6.04 Limitation on Distributions . New, amended text governing distributions.
`.trim();
    const { index } = build("amendment-quoted-heading", text);
    const resolution = index.resolveUniqueNodeByRef("amendment-quoted-heading", "6.04");
    expect(resolution.status).toBe("AMBIGUOUS");
    if (resolution.status === "AMBIGUOUS") {
      expect(resolution.candidates.length).toBeGreaterThanOrEqual(2);
      const starts = resolution.candidates.map((c) => c.charStart);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it("sibling occurrence identity is preserved after the gate runs: every surviving node still has a unique nodeId, independently reachable via getNodeById, and charStart-ordered among siblings", () => {
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness, except as permitted under Section 6.05 Reserved . and subject to the following exceptions: " +
      "(a) Indebtedness existing on the Closing Date; " +
      "(b) intercompany Indebtedness. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const { index, nodes } = build("sibling-identity-after-gate", text);
    const ids = nodes.map((n) => n.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of nodes) {
      expect(index.getNodeById(n.nodeId)?.charStart).toBe(n.charStart);
    }
    const article = index.resolveUniqueNodeByRef("sibling-identity-after-gate", "VI");
    expect(article.status).toBe("UNIQUE");
    if (article.status !== "UNIQUE") return;
    const siblingStarts = index.getChildren(article.node.nodeId).map((c) => c.charStart);
    expect(siblingStarts).toEqual([...siblingStarts].sort((a, b) => a - b));
  });
});
