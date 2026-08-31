/**
 * Phase 3F.1-terminal Part B - INDEPENDENT recertification of OPEN-1
 * (BLOCKER-1: structural heading false negatives / rank-stack corruption),
 * attacking Part A's own claimed remediation (docs/phase-3f1-terminal-
 * architecture-decision/03-structural-final-fix.json) in
 * lib/contract-model/compiler/stage-structure.ts - specifically the new
 * SCORED, compositional `isPlausibleByPositionalSignals` gate that replaced
 * the old strict "signal A OR signal B" boolean gate.
 *
 * NOVELTY: this file was written fresh, after reading in full (and
 * confirming no case is reused from):
 *   - tests/certification/part-b-recert-finding1-independent.test.ts (all 13
 *     describe blocks, including the 8 fresh categories Part A itself added)
 *   - the production source, lib/contract-model/compiler/stage-structure.ts,
 *     read directly rather than trusting Part A's own self-assessment.
 *
 * WHAT PART A'S OWN SUITE NEVER TESTED: every existing false-positive
 * control in part-b-recert-finding1-independent.test.ts (describe block 9)
 * pairs a closing-bracket-ending citation with NO glued footnote/page-marker
 * noise, to prove the bracket shape alone supplies no acceptance weight.
 * None of them test the inverse composition: a REAL, genuine footnote/
 * endnote marker - present and glued to something completely UNRELATED to
 * the candidate under test (an earlier, different sentence's own closing
 * quote/paren/bracket) - sitting immediately before an ORDINARY in-text
 * cross-reference that itself happens to begin a physical line (e.g. because
 * of paragraph wrapping) and is shaped exactly like "Section N.NN Title."
 * (or its ALL-CAPS/lowercase/integer variants). `isPlausibleByPositionalSignals`
 * computes `noiseDiscounted` purely as "did stripping change the `before`
 * text at all", with NO check that the discounted noise has anything to do
 * with THIS candidate specifically being a genuine boundary, as opposed to
 * being carried over from whatever sentence happens to sit immediately
 * before it. Combined with CLOSING_DELIMITER (1) and AT_LEAST_ONE_NEWLINE
 * (1), this reaches the threshold (3) and launders an ordinary in-text
 * citation - continuing the SAME paragraph of body prose as a real,
 * genuinely different enclosing section - into a false top-level heading,
 * reproducing the exact "rank-stack corruption" failure class OPEN-1 is
 * about: a real child node (a lettered clause that is actually part of the
 * true enclosing section's own body) is silently re-parented away from its
 * correct ancestor to the spurious node instead.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

function parse(text: string, documentId = "doc") {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  return {
    nodes,
    sections: nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef),
    articles: nodes.filter((n) => n.nodeType === "ARTICLE").map((n) => n.sectionRef),
  };
}

// ---------------------------------------------------------------------------
// 1. PRIMARY FALSIFICATION: an ordinary in-text SECTION-shaped citation,
//    continuing the SAME paragraph as the real enclosing Section 6.08's own
//    body prose, is wrongly promoted to a genuine top-level SECTION node
//    purely because a genuine footnote marker - glued to a completely
//    UNRELATED closing paren/quote earlier in Section 6.08's own sentence -
//    happens to sit immediately before it (on the previous physical line).
//    This reproduces real rank-stack corruption: the lettered clause "(a)"
//    that is actually part of Section 6.08's own body is silently
//    re-parented to the spurious "Section 6.09" node instead of its true
//    parent, 6.08 - "a real child re-parented to the wrong ancestor", not
//    merely to null.
// ---------------------------------------------------------------------------
describe("1. STILL OPEN - a genuine footnote marker glued to an UNRELATED sentence's closing paren launders the FOLLOWING ordinary in-text citation into a false SECTION heading, corrupting the rank stack", () => {
  const buildText = (glued: boolean) =>
    "ARTICLE VI COVENANTS\n\n" +
    `Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as permitted under the definition of "Permitted Tax Distribution")${glued ? "9" : ""}\n` +
    "Section 6.09 Limitation on Restricted Payments. is only an illustrative cross-reference embedded in the same paragraph of ordinary body prose, not a real document heading, and the paragraph continues describing the same limitation without any true section break here at all.\n\n" +
    "(a) Permitted Liens existing on the Closing Date.\n\n" +
    "Section 6.10 Liens. The Borrower shall not create Liens.";

  it("FALSIFYING: with the unrelated footnote digit present, the in-text citation 'Section 6.09 ...' is wrongly accepted as a real heading, and clause (a) - genuinely part of Section 6.08's own body - is re-parented to the spurious 6.09 node instead of its true parent, 6.08", () => {
    const { nodes, sections } = parse(buildText(true), "open1-independent-noise-adjacency-false-positive");
    // EXPECTED (correct) behavior, which the current fix does NOT deliver:
    // "6.09" should never appear as a real top-level SECTION at all here,
    // and clause (a) should be parented to 6.08. Both assertions below are
    // the falsifying evidence - they document the ACTUAL (wrong) output the
    // current implementation produces, proving the defect is still present.
    const spurious609 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.09");
    expect(spurious609).toBeDefined(); // FALSIFYING: a real heading suite should not find this
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.09"); // FALSIFYING: should be "6.08" - this is the rank-stack corruption
    expect(sections).toEqual(expect.arrayContaining(["6.08", "6.09", "6.10"]));
  });

  it("ISOLATION CONTROL: the IDENTICAL text with the footnote digit removed (no noise to discount at all) is correctly rejected - proves the false positive is caused by the unrelated noise tipping the score, not by the citation's own shape or the newline alone", () => {
    const { nodes, sections } = parse(buildText(false), "open1-independent-noise-adjacency-control-no-noise");
    expect(nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.09")).toBeUndefined();
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
    expect(sections).toEqual(["6.08", "6.10"]);
  });
});

// ---------------------------------------------------------------------------
// 2. GENERALIZATION CHECK: the same noise-adjacency false positive reproduces
//    under a materially different punctuation/case combination (lowercase
//    keyword throughout, a closing SQUARE BRACKET instead of a quote/paren,
//    a 2-digit marker instead of 1-digit) - proving this is a genuine CLASS
//    of false positive inherent to the scored design, not an artifact of one
//    specific character combination in finding 1 above.
// ---------------------------------------------------------------------------
describe("2. STILL OPEN (generalization) - the same noise-adjacency false positive reproduces with a different keyword case, delimiter, and digit width", () => {
  const buildText = (glued: boolean) =>
    "ARTICLE VIII MISCELLANEOUS\n\n" +
    `section 8.05 restrictions. no payment shall be made except as permitted under the definition of [permitted refinancing indebtedness]${glued ? "12" : ""}\n` +
    "section 8.06 miscellaneous provisions. is merely a cross-reference to another part of this instrument embedded within the same paragraph of ordinary prose discussing the same restriction, and this sentence continues without any real section boundary occurring here at all.\n\n" +
    "(a) further restrictions apply.\n\n" +
    "section 8.07 amendments. no amendment shall be effective unless in writing.";

  it("FALSIFYING: lowercase keyword + closing square bracket + 2-digit marker reproduces the identical class - spurious 8.06 accepted, clause (a) re-parented away from its true parent 8.05", () => {
    const { nodes } = parse(buildText(true), "open1-independent-generalization-bracket-2digit");
    const spurious806 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "8.06");
    expect(spurious806).toBeDefined(); // FALSIFYING
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("8.06"); // FALSIFYING: should be "8.05"
  });

  it("control: without the glued digit, 8.06 is correctly rejected and clause (a) is correctly parented to 8.05", () => {
    const { nodes } = parse(buildText(false), "open1-independent-generalization-bracket-2digit-control");
    expect(nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "8.06")).toBeUndefined();
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("8.05");
  });
});

// ---------------------------------------------------------------------------
// 3. Fresh false-negative confirmations across pattern FAMILIES Part A's own
//    suite never exercised for the OPEN-1 shape (it only ever composed
//    footnote-adjacency with SECTION_PATTERNS/ARTICLE_PATTERNS, the
//    decimal-style/keyword-style shapes) - the flat-integer amendment
//    convention (INTEGER_SECTION_PATTERNS, "SECTION N. Title.") and the
//    bare-integer no-keyword convention (BARE_INTEGER_SECTION_PATTERN,
//    "N. Title"), each combined with a genuine footnote marker glued to an
//    unrelated closing quote immediately before the FIRST real heading, and
//    zero blank lines throughout. These HOLD (no false negative) - included
//    as the honest positive counterpart, not merely defect-hunting.
// ---------------------------------------------------------------------------
describe("3. HOLDS - the false-negative fix generalizes correctly to the integer-section and bare-integer pattern families, untested by Part A's own suite", () => {
  it("flat 'SECTION N.' amendment-style headings, preceded by an unrelated footnote-glued closing quote, survive with correct (no) parentage", () => {
    const text =
      'This First Omnibus Amendment amends the Credit Agreement as referenced therein (the "Existing Agreement")3\n' +
      "SECTION 1. Amendments. The Credit Agreement is hereby amended as set forth below.\n" +
      "SECTION 2. Increased Facility Activation Notice. The Borrower may activate the increased facility by notice.";
    const { sections } = parse(text, "open1-independent-integer-section-false-negative-holds");
    expect(sections).toEqual(expect.arrayContaining(["1", "2"]));
  });

  it("bare 'N. Title' headings with NO keyword at all, preceded by an unrelated footnote-glued closing quote, survive", () => {
    const text =
      'This Amendment refers to certain terms defined in the Existing Agreement (the "Existing Agreement")4\n' +
      "1. Amendment. The Credit Agreement is hereby amended as set forth below.\n" +
      "2. Conditions. This Amendment shall become effective upon satisfaction of the following conditions.";
    const { sections } = parse(text, "open1-independent-bare-integer-false-negative-holds");
    expect(sections).toEqual(expect.arrayContaining(["1", "2"]));
  });
});

// ---------------------------------------------------------------------------
// 4. Direct test of the phase's own §10 structural invariant, FALSE-NEGATIVE
//    direction, with a combination absent from Part A's own suite: an
//    ARTICLE heading using a Roman numeral + fully lowercase keyword/title,
//    glued footnote noise on a closing SQUARE BRACKET (not quote/paren, both
//    already used by Part A's own block 12), zero blank lines anywhere, AND
//    a SECTION immediately following on the very next physical line (no gap
//    at all) - a tighter stacking of the four adverse conditions than Part
//    A's own worst-case test.
// ---------------------------------------------------------------------------
describe("4. HOLDS - §10 invariant, fresh combination: lowercase Roman-numeral ARTICLE + square-bracket-glued footnote + zero blank lines + immediately-adjacent SECTION", () => {
  it("the real ARTICLE and its immediately-following SECTION both survive with correct parentage", () => {
    const text =
      "The recitals conclude with a reference to the defined term set forth in the schedule [Applicable Margin Schedule]7\n" +
      "article ix miscellaneous\n" +
      "section 9.01 governing law. this agreement shall be governed by new york law.";
    const { nodes, articles } = parse(text, "open1-independent-section10-invariant-bracket-adjacent");
    expect(articles).toEqual(["ix"]);
    const section = nodes.find((n) => n.nodeType === "SECTION");
    expect(section?.sectionRef).toBe("9.01");
    expect(section?.parentSectionRef).toBe("ix");
  });
});

// ---------------------------------------------------------------------------
// 5. Direct test of the phase's own §10 invariant, FALSE-POSITIVE direction,
//    restated explicitly: describe blocks 1-2 above are themselves the
//    concrete proof that this half of the invariant is violated - a citation
//    became structural NOT from "line-start position + heading-like
//    capitalization" alone (which Part A's own block 9(c) already correctly
//    guards), but from line-start position + heading-like SHAPE (case is
//    irrelevant, per block 2's lowercase reproduction) + coincidental,
//    causally-UNRELATED noise adjacency. This block records that framing
//    explicitly against the phase's own invariant wording, and adds one more
//    check: a citation with NO heading-like capitalization at all (fully
//    lowercase, per block 2) still gets laundered in, proving capitalization
//    was never actually the guard the design's own doc-comment implies -
//    coincidental noise proximity substitutes for it entirely.
// ---------------------------------------------------------------------------
describe("5. STILL OPEN - restating the §10 false-positive invariant directly: a citation becomes structural from line-start + shape + UNRELATED noise adjacency, with no heading-like capitalization required at all", () => {
  it("the lowercase reproduction from block 2 confirms capitalization plays no role in the false positive - shape plus unrelated noise adjacency alone is sufficient", () => {
    const text =
      "ARTICLE VIII MISCELLANEOUS\n\n" +
      'section 8.05 restrictions. no payment shall be made except as permitted under the definition of [permitted refinancing indebtedness]12\n' +
      "section 8.06 miscellaneous provisions. is merely a cross-reference to another part of this instrument embedded within the same paragraph of ordinary prose discussing the same restriction, and this sentence continues without any real section boundary occurring here at all.\n\n" +
      "(a) further restrictions apply.\n\n" +
      "section 8.07 amendments. no amendment shall be effective unless in writing.";
    const { nodes } = parse(text, "open1-independent-invariant-restatement-lowercase");
    // Fully lowercase throughout - no ALL-CAPS or Title-Case anywhere near the
    // citation - and it is STILL accepted as a heading. FALSIFYING.
    expect(nodes.some((n) => n.nodeType === "SECTION" && n.sectionRef === "8.06")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
describe("summary", () => {
  it("prints the Phase 3F.1-terminal Part B independent recertification result for OPEN-1", () => {
    // eslint-disable-next-line no-console
    console.log(
      "Phase 3F.1-terminal Part B independent recertification of OPEN-1: STILL OPEN. The scored, compositional " +
        "isPlausibleByPositionalSignals gate that Part A introduced to fix the original false-negative (footnote " +
        "glued to a bare closing delimiter dropping a real heading) computes its NOISE_DISCOUNTED signal purely as " +
        "'did stripping typographic noise change the text immediately before this candidate at all', with no " +
        "requirement that the discounted noise have anything to do with THIS candidate genuinely being a heading " +
        "boundary. A genuine footnote marker glued to a wholly UNRELATED sentence's own closing quote/paren/bracket, " +
        "sitting on the physical line immediately before an ORDINARY in-text section citation that itself begins a " +
        "new line, supplies NOISE_DISCOUNTED(1) + CLOSING_DELIMITER(1) + AT_LEAST_ONE_NEWLINE(1) = 3, clearing the " +
        "threshold and promoting that citation into a false top-level SECTION node - reproduced with two materially " +
        "different punctuation/case/digit-width combinations (describe blocks 1 and 2), and confirmed via isolation " +
        "controls (removing only the unrelated glued digit correctly reverts to rejection). This causes real " +
        "rank-stack corruption: a lettered clause that is genuinely part of the true enclosing section's own body is " +
        "silently re-parented to the spurious node instead of its real parent - the same 'child re-parented to the " +
        "wrong ancestor' failure class OPEN-1 names, now reachable via a false POSITIVE rather than the false " +
        "NEGATIVE Part A's own fix targeted. The false-negative direction of the fix (blocks 3-4) does generalize " +
        "correctly across the integer-section and bare-integer pattern families Part A's own suite never exercised. " +
        "See docs/phase-3f1-terminal-architecture-decision/16-structural-recertification.json for the full record.",
    );
    expect(true).toBe(true);
  });
});
