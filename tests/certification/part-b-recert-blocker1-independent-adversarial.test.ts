/**
 * Phase 3F.1.6.RX Part B - independent, PRODUCTION-FROZEN recertification of
 * BLOCKER-1 (structural heading/rank-stack corruption).
 *
 * This file is written by the Part B auditor, NOT Workstream A (see
 * tests/certification/structural-heading-rx-adversarial-expansion.test.ts for
 * Workstream A's own 31-case suite; this file deliberately never reuses a
 * case from there, nor from tests/certification/structural-heading-positive-
 * evidence-false-negative-guard.test.ts, nor from tests/foundation-audit/
 * p1-10-rank-stack-plausibility-gate.test.ts).
 *
 * PRODUCTION IS FROZEN for this pass - lib/contract-model/compiler/
 * stage-structure.ts is NOT modified here. This file's job is to
 * independently attack the frozen implementation with fresh adversarial
 * cases and report real evidence, not to fix anything.
 *
 * Sections 1-4 below PIN four genuine, general, reproducible false-negative
 * defects this Part B pass discovered, in exactly the categories the Part B
 * charter named as attack vectors ("nested numbering ... with inconsistent
 * capitalization," "headings immediately following a footnote marker,"
 * "multi-column layouts collapsed to plain text") plus one discovered while
 * independently re-attacking Workstream A's own RX-GAP-1 fix from a fresh
 * angle. None of the four occur in the real FWRG/LSB/CONMED/DSGR fixtures
 * today (independently confirmed by direct grep - see this phase's own
 * 23-part-b-blocker1-blocker11-recertification.json for the exact commands
 * run), so none regress any certified real-fixture site; each is a
 * synthetic-only, forward-looking gap. Unlike the ALREADY-DOCUMENTED
 * Category 6 residual in Workstream A's own suite (single-newline,
 * no-terminal-punctuation heading after a table/list/signature block, left
 * deliberately unfixed because fixing it would directly reopen the real,
 * certified STRUCT-1 false-positive class), these four gaps carry NO such
 * precision trade-off: nothing about fixing case-sensitivity or tolerating a
 * short trailing footnote-marker digit before the plausibility checks would
 * reopen any known false-positive site. They are therefore reported as
 * genuine, currently-unaddressed gaps, not a reasoned, examined boundary.
 *
 * Three of the four (Sections 1, 2's ARTICLE half, and Section 4) share ONE
 * root cause worth naming explicitly: every SHAPE-BASED (non-line-anchored)
 * regex in this file - ARTICLE_PATTERNS[0], SECTION_PATTERNS[0], and
 * stripTrailingPageNumberArtifact's own artifact regex - is case-SENSITIVE
 * (no `i` flag), while only the LINE-ANCHORED fallback patterns carry `i`.
 * A document using an unexpected but real typographic case convention (an
 * all-lowercase keyword, or an ALL-CAPS running-footer label - both
 * extremely common real drafting/rendering conventions) is invisible to the
 * shape-based patterns and can only be rescued by accident, when it also
 * happens to sit at a literal line start. This is one general, systemic gap
 * appearing in three call sites, not three unrelated defects.
 *
 * Each `it` block below asserts the ACTUAL (defective) behavior observed
 * against the current, frozen `stage-structure.ts` - a "red-pinned" test in
 * the sense that a future remediation of BLOCKER-1 must flip these
 * assertions, not preserve them. This keeps the suite GREEN today (honestly
 * documenting the frozen system's real behavior) while making each defect
 * mechanically reproducible for whoever picks up the fix.
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
// 1. STILL-OPEN FALSE NEGATIVE: inconsistent capitalization of the "Section"
//    keyword, mid-sentence (not at a literal line start), is completely
//    invisible - the shape-based SECTION_PATTERNS[0] requires the LITERAL
//    case "Section"/"SECTION" (no `i` flag), and only the line-anchored
//    fallback patterns (SECTION_PATTERNS[1..3]) carry the `i` flag. A
//    continuous-prose document with no newlines at all (the module's own
//    doc-comment names this EXACT real style - FWRG's own certified fixture)
//    can never fall back to a line-anchored pattern, so a lowercase-keyword
//    heading there is invisible regardless of how much positional/paragraph
//    evidence surrounds it. This is a direct structural recurrence of the
//    ORIGINAL historical defect the ARTICLE_PATTERNS doc-comment describes
//    (line-anchored-only patterns going blind on a newline-free document),
//    just triggered by keyword CASE instead of by newline ABSENCE.
// ---------------------------------------------------------------------------
describe("1. STILL OPEN - lowercase 'section' keyword heading, not at a literal line start, is silently dropped", () => {
  it("a lowercase-keyword heading mid-paragraph (genuine sentence-terminal period before it, no real newline) is NOT found, even though its ALL positional evidence (a real preceding period) is present", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness. " +
      "section 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens. " +
      "Section 6.03 Restricted Payments. No Loan Party shall make Restricted Payments.";
    const { sections } = parse(text, "part-b-still-open-lowercase-section-midsentence");
    // Documents the CURRENT (defective) behavior: 6.02 is missing.
    expect(sections).toEqual(["6.01", "6.03"]);
    expect(sections).not.toContain("6.02");
  });

  it("control: the identical shape with the keyword capitalized correctly ('Section') is found - isolates the defect to case, not to the mid-sentence position itself", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness. " +
      "Section 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens. " +
      "Section 6.03 Restricted Payments. No Loan Party shall make Restricted Payments.";
    const { sections } = parse(text, "part-b-control-correct-case-midsentence");
    expect(sections).toEqual(["6.01", "6.02", "6.03"]);
  });

  it("control: the SAME lowercase-keyword shape IS found when it happens to sit at a literal line start (the case-insensitive line-anchored fallback pattern rescues it there) - confirms the gap is specifically 'lowercase AND not line-anchored', not lowercase in general", () => {
    const text = "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\nsection 6.02 Liens. No Loan Party shall grant Liens.\n\n(a) Permitted Liens.";
    const { sections } = parse(text, "part-b-control-lowercase-line-start-rescued");
    expect(sections).toEqual(expect.arrayContaining(["6.01", "6.02"]));
  });
});

// ---------------------------------------------------------------------------
// 2. STILL-OPEN FALSE NEGATIVE + STRUCTURAL CORRUPTION: a footnote-reference
//    marker (a bare 1-2 digit run with NO surrounding whitespace, glued
//    directly onto real sentence-terminal punctuation - the standard shape a
//    superscript footnote number collapses to under plain-text PDF
//    extraction) defeats BOTH positional signals when only a single newline
//    separates it from the next heading: signal (B) fails because the
//    digit, not the period, is now the real last character; signal (A)
//    fails because there is only one newline, not two. This reproduces for
//    BOTH SECTION and ARTICLE candidates, and - when it drops a real
//    ARTICLE - causes real rank-stack corruption: the ARTICLE's own real
//    child SECTION is silently re-parented to `parentSectionRef: null`
//    instead of the correct ARTICLE ref, exactly the class of corruption
//    BLOCKER-1 (title: "Structural heading/rank-stack corruption") exists to
//    prevent, just in the opposite direction (a real parent silently
//    vanishing, rather than a spurious node being accepted).
// ---------------------------------------------------------------------------
describe("2. STILL OPEN - a footnote-marker digit glued to real terminal punctuation, single newline before the next heading, silently drops the heading (SECTION and ARTICLE alike) and can corrupt parentage", () => {
  it("a SECTION heading is dropped when the immediately preceding sentence's period is followed by a glued single-digit footnote marker and only one newline", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness, as amended.1\n" +
      "Section 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.\n\n(a) Liens existing on the Closing Date.";
    const { sections } = parse(text, "part-b-still-open-footnote-marker-section");
    expect(sections).toEqual(["6.01"]);
    expect(sections).not.toContain("6.02");
  });

  it("control: the identical shape with NO footnote-marker digit (period glued directly to the newline) is found - isolates the defect to the glued digit, not to the single-newline boundary alone (that boundary is already exercised, and known-safe, elsewhere)", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness, as amended.\n" +
      "Section 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.\n\n(a) Liens existing on the Closing Date.";
    const { sections } = parse(text, "part-b-control-no-footnote-marker-section");
    expect(sections).toEqual(expect.arrayContaining(["6.01", "6.02"]));
  });

  it("an ARTICLE heading is likewise dropped under the identical shape, and its real child SECTION is then mis-parented to parentSectionRef=null instead of the correct ARTICLE ref - a real rank-stack corruption, not merely a missing node", () => {
    const text =
      "Section 5.99 Miscellaneous. Final provisions apply, as amended.1\n" +
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\n(a) x.\n\n" +
      "ARTICLE VII EVENTS OF DEFAULT\n\n" +
      "Section 7.01 Events of Default. Text.";
    const { nodes, articles } = parse(text, "part-b-still-open-footnote-marker-article-misparent");
    expect(articles).toEqual(["VII"]); // ARTICLE VI is silently dropped entirely
    const s601 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.01");
    expect(s601).toBeDefined();
    expect(s601!.parentSectionRef).toBeNull(); // should be "VI" - real parentage lost
  });

  it("control: the identical ARTICLE-drop shape with NO footnote-marker digit correctly preserves ARTICLE VI and its real child's parentage", () => {
    const text =
      "Section 5.99 Miscellaneous. Final provisions apply, as amended.\n" +
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\n(a) x.\n\n" +
      "ARTICLE VII EVENTS OF DEFAULT\n\n" +
      "Section 7.01 Events of Default. Text.";
    const { nodes, articles } = parse(text, "part-b-control-no-footnote-marker-article");
    expect(articles).toEqual(["VI", "VII"]);
    const s601 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.01");
    expect(s601!.parentSectionRef).toBe("VI");
  });
});

// ---------------------------------------------------------------------------
// 3. STILL-OPEN FALSE NEGATIVE + CONTENT MISATTRIBUTION: a multi-column PDF
//    layout collapsed line-by-line into a single linear text stream (a real,
//    common PDF-text-extraction failure mode for a two-column-formatted
//    schedule/exhibit) can land a genuine heading mid-interleaving, where it
//    is separated from the preceding (unrelated, other-column) text by only
//    a single newline and no terminal punctuation - defeating all three
//    signals identically to (and for the same underlying reason as) the
//    already-documented Category 6 boundary, but via a DIFFERENT, newly
//    named real-world mechanism (column interleaving, not a table/list/
//    signature block) the charter explicitly asked this pass to probe. The
//    dropped heading's own real content is then silently absorbed into the
//    PRECEDING section's owned span - a real content-misattribution, not
//    merely a missing index entry.
// ---------------------------------------------------------------------------
describe("3. STILL OPEN - a multi-column layout collapsed to interleaved plain text can drop a genuine heading and misattribute its content to the wrong section", () => {
  it("Section 6.02's own heading is dropped when two collapsed columns interleave it between column-1 text fragments with only single newlines and no terminal punctuation", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan\n" +
      "Section 6.02 Liens. No Loan Party\n" +
      "Party shall incur Indebtedness except\n" +
      "shall grant Liens except Permitted\n" +
      "Permitted Indebtedness.\n" +
      "Liens.\n\n(a) x.\n\n(a) y.";
    const { sections, nodes } = parse(text, "part-b-still-open-multicolumn-collapse");
    expect(sections).toEqual(["6.01"]);
    expect(sections).not.toContain("6.02");
    // The real "Liens." text (Section 6.02's own actual title continuation)
    // is silently absorbed into Section 6.01's owned span instead of
    // starting its own node.
    const s601 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.01")!;
    const owned = text.slice(s601.charStart, s601.charEnd);
    expect(owned).toContain("Liens.");
  });
});

// ---------------------------------------------------------------------------
// 4. STILL-OPEN FALSE NEGATIVE (discovered while re-attacking RX-GAP-1's own
//    fix from a fresh angle): the RX fix's widened page-number-artifact
//    shape claims to recognize "an optional 'Page ' label" (see the
//    stripTrailingPageNumberArtifact doc-comment and 03-blocker1-structural-
//    remediation.json's own "Page"/dash-wrapped test matrix), but its actual
//    regex is `(?:[Pp]age\s+)?` - it recognizes "Page "/"page " only, NEVER
//    the ALL-CAPS "PAGE " running-footer/header convention that is at least
//    as common in real scanned/rendered documents as mixed-case "Page". An
//    all-caps-labeled page number between two single newlines is therefore
//    NOT discounted as a decorative artifact at all, the real double-newline
//    signal it should expose is never reached, and the following real
//    heading is silently dropped - the exact same class of failure RX-GAP-1
//    itself was built to fix, just via case rather than via whitespace
//    collapse. This is the same systemic case-sensitivity gap as Section 1
//    above, recurring at a third call site.
// ---------------------------------------------------------------------------
describe("4. STILL OPEN - the RX-widened page-number-artifact label recognizer does not recognize the ALL-CAPS 'PAGE' running-footer convention", () => {
  it("an ALL-CAPS 'PAGE 7' label between two single newlines is NOT discounted as a decorative artifact, and the following real heading is silently dropped", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness except Permitted Indebtedness\nPAGE 7\nSection 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.\n\n(a) Liens existing on the Closing Date.";
    const { sections } = parse(text, "part-b-still-open-allcaps-page-label");
    expect(sections).toEqual(["6.01"]);
    expect(sections).not.toContain("6.02");
  });

  it("control: the identical shape with the Title-Case 'Page' label RX's own fix actually tested IS discounted correctly, and the heading survives - isolates the defect to the ALL-CAPS variant specifically", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness except Permitted Indebtedness\nPage 7\nSection 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.\n\n(a) Liens existing on the Closing Date.";
    const { sections } = parse(text, "part-b-control-titlecase-page-label");
    expect(sections).toContain("6.02");
  });

  it("control: lowercase 'page 7' (the OTHER shape RX's own fix tested) is also correctly discounted, confirming the gap is specifically the ALL-CAPS case, not case-insensitivity in general", () => {
    const text =
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness except Permitted Indebtedness\npage 7\nSection 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.\n\n(a) Liens existing on the Closing Date.";
    const { sections } = parse(text, "part-b-control-lowercase-page-label");
    expect(sections).toContain("6.02");
  });
});

// ---------------------------------------------------------------------------
// 5. Reconfirmation (fresh, independent execution, not merely re-running
//    Workstream A's own suite): the two claimed RX fixes hold against real
//    fixture text under NEW probing angles not in Workstream A's own file.
// ---------------------------------------------------------------------------
describe("5. independent reconfirmation of the two claimed RX fixes under fresh probing angles", () => {
  it("RX-GAP-2 fix (unionMatches for SECTION_PATTERNS): THREE distinct conventions ('Section 6.01', a bare '6.02', and '§6.03') co-occurring in the SAME document all survive together, not just pairs of two as Workstream A's own suite tested", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.01 Indebtedness. Text.\n\n(a) x.\n\n" +
      "6.02 Liens. Text.\n\n(a) x.\n\n" +
      "§6.03 Restricted Payments. Text.\n\n(a) x.";
    const { sections } = parse(text, "part-b-recheck-triple-mixed-convention");
    expect(sections).toEqual(expect.arrayContaining(["6.01", "6.02", "6.03"]));
  });

  it("RX-GAP-2 fix does not double-count: a document using ONLY the keyword style produces exactly one node per real heading, never a duplicate from a lower-priority pattern also matching the same span", () => {
    const text = "Section 6.01 Indebtedness. Text.\n\n(a) x.\n\nSection 6.02 Liens. Text.\n\n(a) x.";
    const { nodes } = parse(text, "part-b-recheck-no-double-count");
    const s601 = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.01");
    expect(s601).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Precision re-attack: does the RX-widened page-number-artifact shape
//    ("Page "/dash label recognition) open any NEW false-positive that a
//    bare-digit-only artifact recognizer could not already have produced?
//    (Answer, independently verified: no - the widening only affects WHICH
//    trailing token is discounted, never how many real newlines must
//    already exist in the source for signal (A) to fire; a bare digit alone
//    was already sufficient to trigger the same signal before this fix, so
//    this is a pre-existing, disclosed 3F.1.6.R design tradeoff, not
//    something RX's own change introduced.)
// ---------------------------------------------------------------------------
describe("6. precision re-attack: the widened page-number-artifact shape ('Page'/dash label) does not launder a real in-text citation that lacks a genuine double-newline break", () => {
  it("a real in-text citation ending in 'at page 42' with only a SINGLE newline before the next citation-shaped text is still correctly rejected", () => {
    const text =
      "Section 6.01 Indebtedness. Neither party shall incur Indebtedness of the type set forth in Section 6.05 Reserved, as more particularly discussed at page 42\n" +
      "Section 6.06 Liens . Neither party shall grant Liens except Permitted Liens.\n\n(a) Permitted Liens.";
    const { sections } = parse(text, "part-b-precision-page-citation-single-newline");
    expect(sections.includes("6.05")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
describe("summary", () => {
  it("prints the Part B independent BLOCKER-1 recertification result", () => {
    // eslint-disable-next-line no-console
    console.log(
      "Part B BLOCKER-1 recertification: 4 genuine, general, currently-unaddressed false-negative gaps found and pinned " +
        "(lowercase-keyword mid-sentence heading; footnote-marker-glued single-newline heading, SECTION and ARTICLE alike, " +
        "with demonstrated real parentage corruption on the ARTICLE case; multi-column-collapse interleaving with demonstrated " +
        "content misattribution; ALL-CAPS 'PAGE' running-footer label not recognized by RX's own widened artifact regex). " +
        "Three of the four share one systemic case-sensitivity root cause across ARTICLE_PATTERNS[0], SECTION_PATTERNS[0], " +
        "and stripTrailingPageNumberArtifact's own regex. None occur in the real FWRG/LSB/CONMED/DSGR fixtures today " +
        "(independently confirmed absent by direct grep). The two claimed RX fixes otherwise independently reconfirmed sound " +
        "under fresh probing angles, including a 3-way mixed-convention case and a precision re-attack on the widened " +
        "artifact shape. Disposition: STILL_OPEN.",
    );
    expect(true).toBe(true);
  });
});
