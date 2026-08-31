/**
 * HEADROOM FINAL 3F.1 CLOSURE - Part B INDEPENDENT recertification of FIX-1
 * (structural heading, lib/contract-model/compiler/stage-structure.ts).
 *
 * Written FRESH by an independent auditor. Read (but do not reuse any
 * fixture text from) tests/certification/part-a-final-fix1-structural.test.ts
 * (the implementer's own required matrix, 22 cases) and
 * tests/certification/part-b-terminal-recert-open1-independent.test.ts (the
 * prior phase's own reproduction, now updated to certify the fix). Every
 * construction below is new.
 *
 * SCOPE: FIX-1 removed `NOISE_DISCOUNTED` and replaced it with
 * `titleBodySeparationHolds` - a candidate-local, purely POST-match signal
 * that inspects what follows a candidate's own matched span. Lowercase there
 * => reject (hard veto); anything else (uppercase, digit, opening
 * quote/bracket, a recognized heading keyword, or end-of-document) => treated
 * as "genuine, if weak, evidence real content starts here." A second, new
 * piece of surface area - `looksLikeNewContentStartAfterPossibleTitleWrap`,
 * the "bounded, single-hop wrap-tolerance mechanism" the implementer's own
 * report names - was added to rescue titles that wrap across a line break or
 * contain a mid-title abbreviation.
 *
 * RESULT OF THIS RECERTIFICATION: the true-heading side (Part 1) and the
 * already-required false-heading shapes (numerically-next citation,
 * schedule/table collapse, adjacent lowercase-keyword ARTICLE/SECTION) all
 * hold up fine against fresh constructions - no regression there. But the
 * central claim - that `titleBodySeparationHolds` closes the false-heading
 * class in general, not merely the specific lowercase-run-on shape the
 * required matrix happens to test - does NOT hold. The signal's entire
 * discriminating power rests on one assumption: "a fake citation's
 * continuation is lowercase; a real heading's is not." That assumption is
 * false whenever an in-text citation is itself grammatically well-formed -
 * i.e. terminates its own sentence with a real period and is followed by an
 * ordinary NEW sentence (which, in real drafting, is capitalized, exactly
 * like a real heading's own body). Part 2 below reproduces this directly,
 * with zero footnote/noise adjacency, zero lowercase run-on, and in some
 * cases zero preceding whitespace irregularity at all - completely ordinary,
 * well-punctuated in-text citations that any competent drafter would
 * actually write. Part 3 additionally shows the wrap-tolerance mechanism
 * itself introduces its OWN, narrower false-positive path, independent of
 * the general capitalization gap: wrapping a title across a line break
 * *before* its own tell-tale lowercase continuation defeats detection that
 * the exact same text, unwrapped, correctly passes (Case C vs Case D below -
 * the closest thing to a minimal, mechanistic proof available for this
 * class of defect). Part 4 shows a real-heading false-negative side effect
 * of the same lowercase-veto design (a common credit-agreement "Term. means
 * ..." definitions-section drafting convention). Part 5 confirms rank-stack
 * corruption in both directions across the matrix.
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

// =============================================================================
// PART 1 - TRUE HEADING, fresh constructions - confirm the fix's own claimed
// wins hold up (no regression introduced by this audit's own probing)
// =============================================================================
describe("1. TRUE HEADING - fresh constructions confirm no regression", () => {
  it("footnote-adjacent true heading, fresh numbers/wording, survives", () => {
    const text =
      'Section 3.11 Insurance. The Borrower shall maintain insurance coverage as required under the definition of "Required Insurance Amount")14\n\n' +
      "Section 3.12 Environmental Compliance. The Borrower shall comply with Environmental Laws in all material respects.";
    const { sections } = parse(text, "true-fresh-footnote-adjacent");
    expect(sections).toEqual(expect.arrayContaining(["3.11", "3.12"]));
  });

  it("true heading immediately followed by OCR-style extra whitespace/tabs of its own (not merely preceding it) survives", () => {
    const text = "Section 4.01 Indebtedness .   \t \n\n   No Loan Party shall incur Indebtedness except Permitted Indebtedness.\n\nSection 4.02 Liens. Real text.";
    const { sections } = parse(text, "true-fresh-ocr-artifact-after-own-title");
    expect(sections).toEqual(expect.arrayContaining(["4.01", "4.02"]));
  });

  it("adjacent ARTICLE/lowercase-keyword SECTION (signal C shape), fresh construction, survives with correct parentage", () => {
    const text = "ARTICLE VII EVENTS OF DEFAULT\nsection 7.01 Payment Default. Real text describing payment default.\n\nSection 7.02 Covenant Default. Real text.";
    const { nodes } = parse(text, "true-fresh-adjacent-article-section");
    expect(nodes.find((n) => n.sectionRef === "7.01")?.parentSectionRef).toBe("VII");
    expect(nodes.find((n) => n.sectionRef === "7.02")?.parentSectionRef).toBe("VII");
  });

  it("lower-case real heading (ARTICLE and SECTION keywords both lowercase, real title) survives with correct parentage", () => {
    const text = "article ix miscellaneous\n\nsection 9.01 counterparts. this agreement may be executed in counterparts.\n\nSection 9.02 Notices. Real text.";
    const { nodes } = parse(text, "true-fresh-lowercase-real-heading");
    const article = nodes.find((n) => n.nodeType === "ARTICLE");
    expect(article?.sectionRef).toBe("ix");
    expect(nodes.find((n) => n.sectionRef === "9.01")?.parentSectionRef).toBe("ix");
  });

  it("numerically-next prose citation, fresh construction: real preceding section retained, false-numbered continuation correctly rejected", () => {
    const text =
      "Section 5.01 Financial Covenants. Leverage Ratio shall not exceed 4.00 to 1.00 as further described in the succeeding provision immediately below\n" +
      "Section 5.02 Reporting. is discussed only as an aside within this same paragraph and creates no independent heading of its own at this point in the text.\n\n" +
      "(a) Within 45 days.";
    const { sections, nodes } = parse(text, "true-fresh-numerically-next-prose-citation");
    expect(sections).toEqual(["5.01"]);
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("5.01");
  });
});

// =============================================================================
// PART 2 - FALSIFICATION: ordinary, grammatically well-formed citations
// (capitalized/digit-led new sentence, never a lowercase run-on) are still
// accepted as false headings and corrupt the rank-stack, exactly as the
// original defect this fix closes did.
// =============================================================================
describe("2. FALSIFICATION - well-punctuated citation followed by an ordinary NEW sentence still launders through", () => {
  it("citation followed by a completely ordinary capitalized new sentence (no lowercase run-on, no footnote, no noise at all)", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes, sections } = parse(text, "falsify-capitalized-ordinary-continuation");
    // FALSIFICATION: the governing invariant this workstream exists to
    // enforce ("the existence of noise must not itself count as positive
    // heading evidence") is violated by a DIFFERENT, more general route -
    // "the existence of a capital letter must not itself count as positive
    // heading evidence" was never established. 6.09 is accepted:
    expect(sections).toEqual(expect.arrayContaining(["6.08", "6.09", "6.10"]));
    // Rank-stack corruption reproduces: the real clause (a), which belongs
    // to 6.08's own body, is silently re-parented to the spurious 6.09 node.
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.09"); // WRONG - should be "6.08"
  });

  it("citation followed by a quoted defined term (opening quote is itself treated as self-contained, per design) - still a false positive with zero noise/footnote involvement", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      'Section 6.09 Limitation on Restricted Payments. "Indebtedness" shall have the meaning given to it elsewhere in this instrument for purposes of this cross-reference only.\n' +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes } = parse(text, "falsify-quote-after-citation");
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(true); // FALSIFICATION
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.09"); // WRONG - should be "6.08"
  });

  it("citation followed by an ALL-CAPS defined-term acronym (GAAP) starting the next sentence - still a false positive", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      "Section 6.09 Limitation on Restricted Payments. GAAP principles shall govern the calculation of any amount referenced in this cross-reference for accounting purposes.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes } = parse(text, "falsify-allcaps-acronym-after-citation");
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(true); // FALSIFICATION
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.09"); // WRONG - should be "6.08"
  });

  it("citation followed by a digit-led ordinary sentence (a percentage, not a list marker) - still a false positive", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      "Section 6.09 Limitation on Restricted Payments. 50% of any Excess Cash Flow shall be applied as described elsewhere in this instrument for illustrative purposes only in this same paragraph.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes } = parse(text, "falsify-digit-led-sentence-after-citation");
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(true); // FALSIFICATION
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.09"); // WRONG - should be "6.08"
  });

  it("a completely UNRELATED, well-formed second sentence (not merely a citation gloss) still launders a citation into a heading, and swallows real content between the citation's own two lines", () => {
    // Named shape: "two unrelated short lines that happen to look like they
    // could be wrapped into one heading-shaped span" - here the wrap is a
    // real title fragment ("Waiver of") glued to a wholly unrelated next
    // sentence about notice delivery, which has nothing to do with waiver.
    const text =
      "ARTICLE IX MISCELLANEOUS\n\n" +
      "Section 9.04 Assignment. Real prior body text ends here properly.\n\n" +
      "Section 9.05 Waiver of\n" +
      "Notices required under this arrangement shall be delivered in writing to the addresses set forth in Schedule 1 hereto and shall be effective upon actual receipt by the intended recipient party in all cases.\n\n" +
      "Section 9.06 Governing Law. Real next body text.";
    const { nodes } = parse(text, "falsify-two-unrelated-lines-wrap");
    expect(nodes.some((n) => n.sectionRef === "9.05")).toBe(true); // FALSIFICATION
  });
});

// =============================================================================
// PART 3 - THE WRAP-TOLERANCE MECHANISM'S OWN FALSE-POSITIVE PATH: a minimal
// pair proving the mechanism itself (not merely the general capitalization
// gap from Part 2) flips a correct rejection into a false acceptance.
// =============================================================================
describe("3. FALSIFICATION - wrap-tolerance mechanism specifically: identical text, differently line-wrapped, flips the verdict", () => {
  it("Case C (no wrap): the classic lowercase-run-on false citation is correctly REJECTED - baseline sanity check", () => {
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n" +
      "Section 3.09 Limitation on Restricted Payments. is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n" +
      "(a) Real clause that belongs to 3.08.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const { nodes } = parse(text, "wrap-caseC-no-wrap-baseline");
    expect(nodes.some((n) => n.sectionRef === "3.09")).toBe(false);
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("3.08");
  });

  it("Case D (identical text, ONE newline inserted before the wrapped remainder of the fake title): FALSIFICATION - the exact same tell-tale lowercase continuation is now missed and 3.09 is wrongly accepted, corrupting the rank-stack", () => {
    // The ONLY difference from Case C: "Limitation on" and "Restricted
    // Payments." are split across a line break, exactly the shape real PDF
    // text extraction produces routinely and exactly the shape
    // looksLikeNewContentStartAfterPossibleTitleWrap exists to rescue for
    // REAL wrapped titles. Because the wrap-tolerant check only inspects a
    // short window immediately after the resumption point (the wrapped
    // word "Restricted", itself capitalized because it is genuinely part of
    // the fake title), it never reaches the real giveaway ("is only a
    // cross-reference...") a few words later - the same information Case C
    // correctly used to reject this candidate is now invisible to it.
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n" +
      "Section 3.09 Limitation on\n" +
      "Restricted Payments. is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n" +
      "(a) Real clause that belongs to 3.08.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const { nodes } = parse(text, "wrap-caseD-with-wrap-flips-verdict");
    expect(nodes.some((n) => n.sectionRef === "3.09")).toBe(true); // FALSIFICATION - Case C rejected this, Case D (same text, re-wrapped) accepts it
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("3.09"); // WRONG - should be "3.08", as it correctly is in Case C
  });

  it("unrelated footnote + wrapped citation (named required shape): the footnote-noise path and the wrap-tolerance path compose, and the false citation is still accepted", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      'Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as permitted under the definition of "Permitted Tax Distribution")9\n' +
      "Section 6.09 Limitation on\n" +
      "Restricted Payments is only an illustrative cross-reference embedded in the same paragraph of ordinary body prose and creates no real section break here at all, regardless of how it wraps across this physical line boundary.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes } = parse(text, "wrap-unrelated-footnote-plus-wrapped-citation");
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(true); // FALSIFICATION
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.09"); // WRONG - should be "6.08"
  });

  it("unrelated page artifact + wrapped citation (named required shape): same composition via the page-number noise path", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment as further described\n42\n" +
      "Section 6.09 Limitation on\n" +
      "Restricted Payments is only an illustrative cross-reference within the same paragraph and does not create a new section here at all regardless of the physical line wrap.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes } = parse(text, "wrap-unrelated-page-artifact-plus-wrapped-citation");
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(true); // FALSIFICATION
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.09"); // WRONG - should be "6.08"
  });

  it("a fake continuation that is its own complete, unpunctuated-until-line-end sentence (no internal terminal at all) is accepted purely because a real heading happens to follow it", () => {
    // A distinct code path from the internal-terminal-scan cases above:
    // when the whole fake continuation has NO internal '[.:;!?]' followed by
    // whitespace (only one terminal, at the physical line's own end), the
    // match is treated as "validated" and the plain (non-wrap) check simply
    // looks past the ENTIRE swallowed fake sentence to whatever comes next -
    // here, the next REAL section heading - and accepts on that basis alone,
    // never inspecting the fake sentence's own content at all.
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n\n" +
      "Section 3.09 Limitation on Restricted Payments is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const { sections } = parse(text, "wrap-no-internal-terminal-rescued-by-following-real-heading");
    expect(sections).toEqual(expect.arrayContaining(["3.08", "3.09", "3.10"])); // FALSIFICATION - 3.09 should not exist
  });
});

// =============================================================================
// PART 4 - FALSE NEGATIVE: a common definitions-section drafting convention
// ("Term. means ...", omitting a repeated subject) is vetoed as if it were
// the false-citation shape, and its real content is silently absorbed into
// the PRECEDING section's own owned span instead of vanishing cleanly.
// =============================================================================
describe("4. FALSE NEGATIVE - 'Term. means ...' definitions convention is wrongly vetoed", () => {
  it("a real definitions-style heading immediately followed by 'means' (no repeated subject) is dropped, and its real text is silently absorbed into the PRECEDING section's owned span", () => {
    const text =
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.07 Applicable Rate. Real prior definition body text ends here properly.\n\n" +
      "Section 1.08 Applicable Margin. means, with respect to any Loan, the percentage per annum set forth in the Pricing Grid attached as Schedule 1 to this Agreement, as such percentage may be adjusted from time to time.\n\n" +
      "Section 1.09 Business Day. Real next definition body text.";
    const { nodes, sections } = parse(text, "false-negative-definitions-means-style");
    expect(sections).not.toContain("1.08"); // the real heading vanishes entirely
    const s107 = nodes.find((n) => n.sectionRef === "1.07")!;
    // Data corruption in the opposite direction: 1.08's real defined-term
    // text (the actual "Applicable Margin" definition) is now silently
    // owned by 1.07's span instead - a downstream reader asking for 1.07's
    // own text gets 1.08's content bleeding into it.
    expect(text.slice(s107.charStart, s107.charEnd)).toContain("Applicable Margin");
    expect(text.slice(s107.charStart, s107.charEnd)).toContain("Pricing Grid");
  });
});

// =============================================================================
// PART 5 - COMPOSITION SUMMARY: confirm the rank-stack-corruption failure
// class (the module's own named invariant) reproduces in BOTH directions
// across this matrix, not merely as an isolated node-count discrepancy.
// =============================================================================
describe("5. COMPOSITION - rank-stack corruption confirmed in both directions", () => {
  it("false-heading acceptance re-parents a real child clause away from its true enclosing section (summary assertion over Part 2's first case)", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n" +
      "(b) Indebtedness existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes } = parse(text, "composition-false-accept-reparents-children");
    const a = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    const b = nodes.find((n) => n.sectionRef.endsWith("(b)"));
    expect(a?.parentSectionRef).toBe("6.09"); // both should be "6.08"
    expect(b?.parentSectionRef).toBe("6.09");
  });

  it("true-heading suppression absorbs real content into the wrong node's owned span (summary assertion over Part 4)", () => {
    const text =
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.07 Applicable Rate. Real prior definition body text ends here properly.\n\n" +
      "Section 1.08 Applicable Margin. means, with respect to any Loan, the percentage per annum set forth in the Pricing Grid attached as Schedule 1 to this Agreement.\n\n" +
      "Section 1.09 Business Day. Real next definition body text.";
    const { nodes } = parse(text, "composition-false-negative-absorbs-content");
    const s107 = nodes.find((n) => n.sectionRef === "1.07")!;
    const s109 = nodes.find((n) => n.sectionRef === "1.09")!;
    expect(s107.charEnd).toBe(s109.charStart);
    expect(text.slice(s107.charStart, s107.charEnd)).toContain("Applicable Margin"); // 1.08's own content, not 1.07's
  });
});

// =============================================================================
// Summary
// =============================================================================
describe("summary", () => {
  it("prints the Part B independent recertification result for FIX-1", () => {
    // eslint-disable-next-line no-console
    console.log(
      "HEADROOM FINAL 3F.1 CLOSURE Part B independent recert of FIX-1: the true-heading side and the required " +
        "matrix's own named false-heading shapes hold up against fresh constructions. However, titleBodySeparationHolds's " +
        "entire discriminating power rests on 'a fake continuation is lowercase' - false whenever a citation is its own " +
        "well-punctuated sentence followed by an ordinary capitalized/digit-led new sentence (ubiquitous in real drafting), " +
        "which still launders through and corrupts the rank-stack exactly as the original defect did. The wrap-tolerance " +
        "mechanism adds its own narrower path: identical text, merely re-wrapped across a line break before its own " +
        "tell-tale lowercase continuation, flips a correct rejection into a false acceptance (Case C vs Case D). A " +
        "definitions-style 'Term. means ...' real heading is also wrongly vetoed, silently merging its content into the " +
        "preceding section. Disposition: STILL_OPEN. See docs/phase-3f1-final-closure/13-structural-recertification.json.",
    );
    expect(true).toBe(true);
  });
});
