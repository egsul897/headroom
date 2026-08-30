/**
 * Phase 3F.1.6.RX-FINAL Part B - INDEPENDENT recertification of FINDING-1
 * (structural heading false negatives), attacking Workstream A's own claimed
 * remediation in lib/contract-model/compiler/stage-structure.ts (see
 * docs/phase-3f1-6-rx-final-terminal-closure/03-structural-heading-final-
 * remediation.json).
 *
 * This file is written FRESH by an independent Part B auditor and does not
 * reuse a single case from:
 *   - tests/certification/structural-heading-rx-adversarial-expansion.test.ts
 *   - tests/certification/structural-heading-positive-evidence-false-negative-guard.test.ts
 *   - tests/foundation-audit/p1-10-rank-stack-plausibility-gate.test.ts
 *   - tests/certification/part-b-recert-blocker1-independent-adversarial.test.ts
 *   - tests/certification/structural-heading-final-remediation-adversarial.test.ts
 * (all read in full before writing this file).
 *
 * PRODUCTION IS FROZEN for this recertification pass - this file only
 * observes and documents `parseDocumentStructure`'s real behavior; it never
 * modifies lib/, app/, or prisma/. Where the fix is found to still be
 * defective, the assertions below encode the CORRECT/expected behavior (so
 * they read as a normal, meaningful spec and can be flipped to "confirmed
 * fixed" verbatim by a future remediation pass) and are left RED
 * (failing) as the falsification evidence itself - never adjusted to match
 * the current wrong output.
 *
 * FINDING under attack: the remediation's own `stripTrailingFootnoteMarker`
 * doc-comment (stage-structure.ts) claims to recognize "a short (1-3 digit)
 * run glued DIRECTLY ... onto real sentence-terminal punctuation" as a
 * general typographic-noise CLASS. Its actual regex,
 *   /(?<!\d)([.:;!?]["'’”)\]]*)\d{1,3}(\s*)$/
 * requires the class to *begin* with a literal '.', ':', ';', '!', or '?'
 * character. A closing quote or parenthesis is only recognized when it
 * TRAILS that punctuation mark (i.e. the real, common ")." or ".")." order)
 * - never when the closing quote/paren/bracket IS the last visible character
 * of the sentence with no separate terminal-punctuation mark of its own
 * before the glued digit. This is an extremely common real shape: a
 * definition or ratio clause whose sentence effectively ends at a closing
 * parenthesis or quotation mark (a defined term, a cross-reference, a
 * quoted restated heading) with the footnote/endnote marker glued directly
 * onto that bracket/quote and no separate period - either because the
 * drafting convention never adds one there, or because plain-text PDF
 * extraction is well known to lose or merge a period that collides with an
 * adjacent superscript glyph. Below this is shown to reproduce the EXACT
 * "child re-parented to null" rank-stack corruption named in the original
 * frozen finding (docs/phase-3f1-6-rx-final-blocker-closure/
 * 23-part-b-blocker1-blocker11-recertification.json), via a shape distinct
 * from (and not covered by) every case in either committed remediation test
 * file.
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
// 1. STILL OPEN: a footnote/endnote marker glued directly onto a closing
//    PARENTHESIS with no separate terminal punctuation mark of its own
//    defeats both positional signals exactly as the pre-remediation defect
//    did, and - because this ARTICLE is the document's very FIRST top-level
//    heading - reproduces the EXACT "child re-parented to
//    parentSectionRef: null" corruption named in the original frozen
//    finding, not merely a missing index entry.
// ---------------------------------------------------------------------------
describe("1. STILL OPEN - a footnote marker glued to a bare closing paren (no terminal punctuation of its own) still drops the ARTICLE and reparents its child SECTION to null", () => {
  it("ARTICLE I is dropped entirely and its own child SECTION 1.01 is silently reparented to parentSectionRef=null", () => {
    const text =
      'This Credit Agreement is entered into as of the date first written above (the "Agreement")1\n' +
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.01 Defined Terms. Capitalized terms used herein have the meanings set forth below.";
    const { nodes, articles } = parse(text, "finding1-independent-paren-glued-footnote-article");
    // EXPECTED (correct) behavior: ARTICLE I is recognized, and SECTION 1.01
    // is parented to it. This assertion is RED against the current fix -
    // see the deliverable JSON for the actual failing output.
    expect(articles).toEqual(["I"]);
    const section = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "1.01");
    expect(section?.parentSectionRef).toBe("I");
  });

  it("control: the identical shape WITH the terminal period present before the glued digit (the case the fix DOES claim to cover) correctly finds ARTICLE I and preserves parentage - isolates the finding to the missing-punctuation shape specifically, not to footnote markers or first-article documents in general", () => {
    const text =
      'This Credit Agreement is entered into as of the date first written above (the "Agreement").1\n' +
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.01 Defined Terms. Capitalized terms used herein have the meanings set forth below.";
    const { nodes, articles } = parse(text, "finding1-independent-control-period-present");
    expect(articles).toEqual(["I"]);
    const section = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "1.01");
    expect(section?.parentSectionRef).toBe("I");
  });
});

// ---------------------------------------------------------------------------
// 2. STILL OPEN: the same gap for a closing QUOTATION MARK (a quoted defined
//    term or restated heading ending the sentence) rather than a paren -
//    confirms the gap is the general "closing bracket/quote as sentence-end
//    with no separate punctuation mark" shape, not specific to "()".
// ---------------------------------------------------------------------------
describe("2. STILL OPEN - a footnote marker glued to a bare closing quotation mark (no terminal punctuation) also drops the ARTICLE", () => {
  it('ARTICLE I is dropped when the preceding sentence ends in a quoted defined term with the digit glued directly to the closing quote', () => {
    const text =
      'The parties refer to this instrument as the "Credit Agreement"1\n' +
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.01 Defined Terms. Capitalized terms used herein have the meanings set forth below.";
    const { articles } = parse(text, "finding1-independent-quote-glued-footnote-article");
    expect(articles).toEqual(["I"]);
  });
});

// ---------------------------------------------------------------------------
// 3. STILL OPEN: the identical gap reproduces for a SECTION-level heading
//    too (not only ARTICLE), confirming the gap is general across node
//    types exactly as the original fix's own claimed generality would
//    require, and not merely an ARTICLE-specific residual.
// ---------------------------------------------------------------------------
describe("3. STILL OPEN - the same closing-bracket-glued-footnote shape also drops a SECTION heading (not only ARTICLE)", () => {
  it("SECTION 6.02 is dropped when Section 6.01's own body ends in a parenthetical defined term with the digit glued to the closing paren and no terminal period", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      'Section 6.01 Indebtedness. The Borrower shall not permit the Total Leverage Ratio to exceed the level set forth in the definition of "Financial Covenant Level" (as calculated pursuant to the Total Leverage Ratio definition set forth in Section 1.01 of this Agreement)1\n' +
      "Section 6.02 Liens. The Borrower shall not create Liens.";
    const { sections } = parse(text, "finding1-independent-section-level-paren-glued-footnote");
    expect(sections).toEqual(expect.arrayContaining(["6.01", "6.02"]));
  });
});

// ---------------------------------------------------------------------------
// 4. Positive confirmation (holds): the remediation's positional-evidence
//    design is NOT a phrase list - a heading preceded by invented drafting
//    phrasing that appears in NO citation-signal list anywhere (historical
//    or current) is still correctly recognized purely from real terminal
//    punctuation and the newline/case-insensitive-keyword evidence, exactly
//    as the architecture requires. Included as a control to make sure this
//    file is not merely hunting for defects without also checking the
//    claimed positive property holds where it should.
// ---------------------------------------------------------------------------
describe("4. HOLDS - genuinely novel drafting phrasing (not on any phrase list, historical or current) does not block recognition", () => {
  it("a heading preceded by an invented, never-before-seen transitional phrase is still recognized from positional evidence alone", () => {
    const text =
      "Having duly considered the foregoing wherefore-clauses in their entirety, the parties now proceed as follows.\n\n" +
      "ARTICLE IV NEGATIVE COVENANTS\n\n" +
      "Section 4.01 Restricted Payments. No Restricted Payment shall be made.";
    const { articles, sections } = parse(text, "finding1-independent-novel-phrasing-control");
    expect(articles).toEqual(["IV"]);
    expect(sections).toEqual(["4.01"]);
  });

  it("a lowercase 'article' keyword mid-sentence, positioned after a semicolon rather than a period (an unusual position/punctuation combination absent from the committed remediation suites), is still recognized and correctly parents its SECTION - confirms ciKeyword generalizes beyond the specific case/position combinations already tested", () => {
    const text =
      "The Loan Parties acknowledge the foregoing recitals; " +
      "article VII EVENTS OF DEFAULT\n\n" +
      "Section 7.01 Events of Default. An Event of Default occurs upon the following.";
    const { nodes, articles, sections } = parse(text, "finding1-independent-lowercase-after-semicolon");
    expect(articles).toEqual(["VII"]);
    expect(sections).toEqual(["7.01"]);
    const section = nodes.find((n) => n.nodeType === "SECTION");
    expect(section?.parentSectionRef).toBe("VII");
  });

  // NOTE (investigated, NOT counted as a FINDING-1 falsification): the same
  // shape with the SECTION keyword ALSO lowercase ("section 7.01 events of
  // default...") fails to recognize ARTICLE VII at all. Directly verified via
  // scratch probing that this reproduces IDENTICALLY with the ARTICLE keyword
  // in its CORRECT original case ("Article VII EVENTS OF DEFAULT" followed by
  // a lowercase-titled section) - it is a pre-existing, orthogonal structural
  // requirement of ARTICLE_PATTERNS[0]'s own end-of-title lookahead
  // (`(?=\s+[A-Z][a-z]|\s*$)`, which requires the text immediately following
  // an ALL-CAPS title to itself begin with a NEW capitalized word, or be the
  // end of the document), unrelated to and unaffected by ciKeyword's keyword
  // case-insensitivity fix. Not included as a numbered finding above because
  // it is not something this remediation touched or claimed to fix.
});

// ---------------------------------------------------------------------------
// 5. STILL OPEN (secondary, lower-severity finding): when the shape-based
//    ALL-CAPS/title-shape primary ARTICLE pattern fails to match at all
//    (because the real title text is genuinely lowercase, a legitimate if
//    less common heading style now reachable via ciKeyword's own
//    case-insensitive keyword), `bestMatches` silently falls back to the
//    crude line-anchored pattern, which has NO title-shape validation and
//    NO typographic-noise stripping at all - it captures the ENTIRE rest of
//    the physical line verbatim as the heading text, including any glued
//    footnote digit and trailing parenthetical noise. This does not corrupt
//    the rank stack (parentage is still correct) but does produce a
//    corrupted/garbage heading string, which is itself a data-quality
//    regression surfaced by (not present before) making the keyword
//    case-insensitive. Documented for completeness; not the primary
//    falsifying finding above.
// ---------------------------------------------------------------------------
describe("5. STILL OPEN (secondary) - a fully-lowercase-title ARTICLE heading falls back to a crude line-anchored match that captures raw typographic noise into the heading text", () => {
  it('a lowercase-keyword, lowercase-title ARTICLE heading is recognized with a CLEAN heading string, not one containing a glued footnote digit and parenthetical noise', () => {
    const text =
      "Recitals text ends here without any special casing.\n\n" +
      'article vi covenants (the "Covenants")1\n' +
      "section 6.01 indebtedness. The Borrower shall not incur Indebtedness.";
    const { nodes, articles } = parse(text, "finding1-independent-lowercase-title-garbage-heading");
    expect(articles).toEqual(["vi"]);
    const article = nodes.find((n) => n.nodeType === "ARTICLE");
    // EXPECTED (correct) behavior: the heading text is the clean title only,
    // not the raw physical line including the glued footnote digit and
    // parenthetical aside.
    expect(article?.heading).toBe("covenants");
  });
});
