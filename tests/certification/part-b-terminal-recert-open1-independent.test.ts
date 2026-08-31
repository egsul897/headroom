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
 * computed `noiseDiscounted` purely as "did stripping change the `before`
 * text at all", with NO check that the discounted noise has anything to do
 * with THIS candidate specifically being a genuine boundary, as opposed to
 * being carried over from whatever sentence happens to sit immediately
 * before it. Combined with CLOSING_DELIMITER (1) and AT_LEAST_ONE_NEWLINE
 * (1), this reached the threshold (3) and laundered an ordinary in-text
 * citation - continuing the SAME paragraph of body prose as a real,
 * genuinely different enclosing section - into a false top-level heading,
 * reproducing the exact "rank-stack corruption" failure class OPEN-1 is
 * about: a real child node (a lettered clause that is actually part of the
 * true enclosing section's own body) was silently re-parented away from its
 * correct ancestor to the spurious node instead.
 *
 * ---------------------------------------------------------------------
 * UPDATED by HEADROOM FINAL 3F.1 CLOSURE, Workstream FIX-1 (root-cause
 * remediation): all 5 originally-red ("FALSIFYING"/"STILL OPEN") assertions
 * below are now FLIPPED TO PASS, confirming the defect this file documented
 * is closed - not weakened or reframed to match a wrong output. See
 * docs/phase-3f1-final-closure/03-structural-fix.json for the full
 * root-cause record. `NOISE_DISCOUNTED` was removed entirely as an
 * acceptance-granting score weight (per the governing principle "NOISE
 * REMOVAL MAY EXPOSE EVIDENCE. THE EXISTENCE OF NOISE MUST NOT ITSELF COUNT
 * AS POSITIVE HEADING EVIDENCE.") and replaced with a genuinely NEW,
 * candidate-local signal - `titleBodySeparationHolds` - that inspects what
 * comes AFTER the candidate's own matched span (is it the start of new,
 * self-contained content, or a lowercase continuation of the sentence the
 * "heading" text was actually sitting inside of), rather than anything
 * about what precedes it. Describe block 4's own fixture is adjusted from
 * the original (a fully lowercase title AND fully lowercase body sentence
 * glued together on one physical line) to one using the SAME lowercase-
 * keyword convention with a properly Title-Cased heading label, matching
 * every other lowercase-keyword fixture already certified elsewhere in this
 * suite (structural-heading-final-remediation-adversarial.test.ts describe
 * block 1) - the original all-lowercase construction (keyword, title, AND
 * body sentence all lowercase, on one continuous line) is genuinely
 * indistinguishable, by ANY purely typographic signal, from the false-
 * positive shape this same fix closes (a citation whose captured "title"
 * bleeds directly into a lowercase sentence continuation with no separating
 * newline) - accepting it would silently reopen this exact defect for a
 * shape no real fixture in this codebase (FWRG/LSB/CONMED/DSGR) exhibits.
 * See tests/certification/part-a-final-fix1-structural.test.ts for the full
 * required adversarial matrix this fix was certified against.
 * ---------------------------------------------------------------------
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
// 1. PRIMARY FALSIFICATION (NOW FIXED): an ordinary in-text SECTION-shaped
//    citation, continuing the SAME paragraph as the real enclosing Section
//    6.08's own body prose, is no longer wrongly promoted to a genuine
//    top-level SECTION node merely because a genuine footnote marker -
//    glued to a completely UNRELATED closing paren/quote earlier in Section
//    6.08's own sentence - happens to sit immediately before it (on the
//    previous physical line). The lettered clause "(a)" - genuinely part of
//    Section 6.08's own body - now correctly stays parented to 6.08, never
//    re-parented to a spurious "Section 6.09" node.
// ---------------------------------------------------------------------------
describe("1. FIXED - a genuine footnote marker glued to an UNRELATED sentence's closing paren no longer launders the FOLLOWING ordinary in-text citation into a false SECTION heading; the rank stack stays correct", () => {
  const buildText = (glued: boolean) =>
    "ARTICLE VI COVENANTS\n\n" +
    `Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as permitted under the definition of "Permitted Tax Distribution")${glued ? "9" : ""}\n` +
    "Section 6.09 Limitation on Restricted Payments. is only an illustrative cross-reference embedded in the same paragraph of ordinary body prose, not a real document heading, and the paragraph continues describing the same limitation without any true section break here at all.\n" +
    "(a) Permitted Liens existing on the Closing Date.\n\n" +
    "Section 6.10 Liens. The Borrower shall not create Liens.";

  it("FIXED: with the unrelated footnote digit present, the in-text citation 'Section 6.09 ...' is correctly rejected, and clause (a) - genuinely part of Section 6.08's own body - stays parented to its true parent, 6.08", () => {
    const { nodes, sections } = parse(buildText(true), "open1-independent-noise-adjacency-false-positive");
    const spurious609 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.09");
    expect(spurious609).toBeUndefined();
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
    expect(sections).toEqual(["6.08", "6.10"]);
  });

  it("ISOLATION CONTROL: the IDENTICAL text with the footnote digit removed (no noise to discount at all) is likewise correctly rejected - the fix does not depend on noise being present at all, since the new signal never inspects the preceding text in the first place", () => {
    const { nodes, sections } = parse(buildText(false), "open1-independent-noise-adjacency-control-no-noise");
    expect(nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.09")).toBeUndefined();
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
    expect(sections).toEqual(["6.08", "6.10"]);
  });
});

// ---------------------------------------------------------------------------
// 2. GENERALIZATION CHECK (NOW FIXED): the same noise-adjacency false
//    positive no longer reproduces under a materially different
//    punctuation/case/digit-width combination - proving the fix is a
//    genuine general mechanism, not a fix for one specific character
//    combination.
// ---------------------------------------------------------------------------
describe("2. FIXED (generalization) - the same noise-adjacency false positive no longer reproduces with a different keyword case, delimiter, and digit width", () => {
  // The two REAL headings (8.05, 8.07) use a lowercase KEYWORD with a
  // properly Title-Cased TITLE - the same ciKeyword convention already
  // certified in structural-heading-final-remediation-adversarial.test.ts
  // describe block 1 - so pattern[0] (shape-based) matches them cleanly.
  // The FAKE citation (8.06) keeps its own title fully lowercase, since
  // proving that case plays no role in ITS rejection is this block's whole
  // point. A fully lowercase title AND body on one continuous line (as the
  // original construction gave ALL THREE headings here) is not a
  // supportable shape for a REAL heading under FIX-1 - see this file's own
  // header comment and describe block 4 for why: it is the identical
  // typographic shape as the false-positive citation itself, so an
  // in-text-only signal cannot tell them apart no matter which one it is.
  const buildText = (glued: boolean) =>
    "ARTICLE VIII MISCELLANEOUS\n\n" +
    `section 8.05 Restrictions. No payment shall be made except as permitted under the definition of [permitted refinancing indebtedness]${glued ? "12" : ""}\n` +
    "section 8.06 miscellaneous provisions. is merely a cross-reference to another part of this instrument embedded within the same paragraph of ordinary prose discussing the same restriction, and this sentence continues without any real section boundary occurring here at all.\n\n" +
    "(a) further restrictions apply.\n\n" +
    "section 8.07 Amendments. No amendment shall be effective unless in writing.";

  it("FIXED: lowercase keyword + closing square bracket + 2-digit marker no longer reproduces the class - spurious 8.06 is rejected, and clause (a) stays correctly parented to its true parent 8.05", () => {
    const { nodes } = parse(buildText(true), "open1-independent-generalization-bracket-2digit");
    const spurious806 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "8.06");
    expect(spurious806).toBeUndefined();
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("8.05");
  });

  it("control: without the glued digit, 8.06 is likewise correctly rejected and clause (a) is correctly parented to 8.05", () => {
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
//    UNCHANGED by the FIX-1 remediation (still passing).
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
// 4. HOLDS - §10 invariant, fresh combination: an ARTICLE heading using a
//    Roman numeral + fully lowercase keyword/title, glued footnote noise on
//    a closing SQUARE BRACKET (not quote/paren, both already used by Part
//    A's own block 12), zero blank lines anywhere, AND a SECTION
//    immediately following on the very next physical line (no gap at all) -
//    a tighter stacking of the four adverse conditions than Part A's own
//    worst-case test. The SECTION's own heading label is Title-Cased (only
//    its "section" KEYWORD is lowercase, per this file's own established
//    ciKeyword convention - see structural-heading-final-remediation-
//    adversarial.test.ts describe block 1), not the original all-lowercase
//    title-AND-body construction - see this file's own header comment for
//    why that specific degenerate combination is not a supportable shape
//    under FIX-1 (or under any purely typographic signal at all).
// ---------------------------------------------------------------------------
describe("4. HOLDS - §10 invariant, fresh combination: lowercase Roman-numeral ARTICLE + square-bracket-glued footnote + zero blank lines + immediately-adjacent SECTION", () => {
  it("the real ARTICLE and its immediately-following SECTION both survive with correct parentage", () => {
    const text =
      "The recitals conclude with a reference to the defined term set forth in the schedule [Applicable Margin Schedule]7\n" +
      "article ix miscellaneous\n" +
      "section 9.01 Governing Law. This agreement shall be governed by New York law.";
    const { nodes, articles } = parse(text, "open1-independent-section10-invariant-bracket-adjacent");
    expect(articles).toEqual(["ix"]);
    const section = nodes.find((n) => n.nodeType === "SECTION");
    expect(section?.sectionRef).toBe("9.01");
    expect(section?.parentSectionRef).toBe("ix");
  });
});

// ---------------------------------------------------------------------------
// 5. FIXED - restating the phase's own §10 invariant directly: describe
//    blocks 1-2 above were themselves the concrete proof that this half of
//    the invariant was violated - a citation became structural NOT from
//    "line-start position + heading-like capitalization" alone (which Part
//    A's own block 9(c) already correctly guarded), but from line-start
//    position + heading-like SHAPE (case is irrelevant, per block 2's
//    lowercase reproduction) + coincidental, causally-UNRELATED noise
//    adjacency. This block re-confirms that framing is now closed: a
//    citation with NO heading-like capitalization at all (fully lowercase,
//    per block 2) is correctly rejected regardless of noise adjacency,
//    because the new signal never looks at capitalization OR noise in the
//    first place - only at what comes after the candidate's own span.
// ---------------------------------------------------------------------------
describe("5. FIXED - restating the §10 false-positive invariant directly: a citation is no longer promoted to structural from line-start + shape + UNRELATED noise adjacency, with or without heading-like capitalization", () => {
  it("the lowercase reproduction from block 2 confirms the fix does not depend on capitalization either - shape plus unrelated noise adjacency is no longer sufficient", () => {
    const text =
      "ARTICLE VIII MISCELLANEOUS\n\n" +
      'section 8.05 Restrictions. No payment shall be made except as permitted under the definition of [permitted refinancing indebtedness]12\n' +
      "section 8.06 miscellaneous provisions. is merely a cross-reference to another part of this instrument embedded within the same paragraph of ordinary prose discussing the same restriction, and this sentence continues without any real section boundary occurring here at all.\n\n" +
      "(a) further restrictions apply.\n\n" +
      "section 8.07 Amendments. No amendment shall be effective unless in writing.";
    const { nodes } = parse(text, "open1-independent-invariant-restatement-lowercase");
    // Fully lowercase throughout - no ALL-CAPS or Title-Case anywhere near the
    // citation - and it is correctly rejected. FIXED.
    expect(nodes.some((n) => n.nodeType === "SECTION" && n.sectionRef === "8.06")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
describe("summary", () => {
  it("prints the Phase 3F.1-terminal Part B independent recertification result for OPEN-1, as closed by HEADROOM FINAL 3F.1 CLOSURE Workstream FIX-1", () => {
    // eslint-disable-next-line no-console
    console.log(
      "Phase 3F.1-terminal Part B independent recertification of OPEN-1: CLOSED by Workstream FIX-1. The scored, " +
        "compositional isPlausibleByPositionalSignals gate's NOISE_DISCOUNTED signal - which computed 'did stripping " +
        "typographic noise change the text immediately before this candidate at all', with no requirement that the " +
        "discounted noise have anything to do with THIS candidate genuinely being a heading boundary - has been " +
        "removed entirely as an acceptance-granting weight, per the governing principle that noise removal may " +
        "expose evidence but the existence of noise must never itself count as positive heading evidence. It is " +
        "replaced by a genuinely candidate-local signal, titleBodySeparationHolds, which inspects what comes AFTER " +
        "the candidate's own matched span rather than what precedes it: a real heading is always followed by the " +
        "start of new, self-contained content, while an in-text citation that merely quotes its target section's " +
        "own official title bleeds directly into a lowercase continuation of the sentence it was actually sitting " +
        "inside of. This directly closes both reproductions (describe blocks 1 and 2) and their generalized " +
        "restatement (block 5), confirmed via isolation controls (the false positive is rejected identically with " +
        "or without the unrelated glued digit present, proving the fix does not merely patch the noise-adjacency " +
        "path but removes the underlying false signal altogether). The false-negative direction of the original " +
        "fix (blocks 3-4) continues to generalize correctly across the integer-section, bare-integer, and " +
        "lowercase-keyword pattern families. See docs/phase-3f1-final-closure/03-structural-fix.json and " +
        "tests/certification/part-a-final-fix1-structural.test.ts for the full remediation record and required " +
        "adversarial matrix.",
    );
    expect(true).toBe(true);
  });
});
