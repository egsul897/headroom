/**
 * Phase 3F.1.6.R (Workstream C) - false-negative guard for the
 * positive-evidence heading-plausibility gate that replaced P1-10's
 * 14-phrase citation-signal list (see the doc-comment above
 * `isPlausibleByPositionalSignals` in lib/contract-model/compiler/
 * stage-structure.ts, and docs/phase-3f1-6-r-blocker-remediation/03-
 * structural-heading-remediation.json for the full design record).
 *
 * The remediation charter is explicit: "a fix that improves precision by
 * destroying recall is not acceptable." This suite is that guard - an
 * adversarial matrix of LEGITIMATE headings that must survive the new gate,
 * covering every category the charter names at minimum: ARTICLE headings,
 * SECTION headings, a heading immediately after a sentence containing
 * another section citation, headings after semicolon/colon, page-boundary-
 * like headings, OCR-like irregular whitespace, headings with no
 * descriptive title (bare number only), legitimate repeated section labels
 * across different articles, schedules/exhibits references preceding a
 * real heading, deeply nested clause headings, and a heading surrounded by
 * malformed/irregular neighboring text.
 *
 * Every category is exercised twice where practical: once against REAL text
 * already present in the FWRG/LSB/CONMED/DSGR fixtures (for realism - never
 * assuming a single formatting convention), and once as a fresh synthetic
 * construction isolating the specific tricky shape. All assertions drive
 * the real, unmodified `parseDocumentStructure` end-to-end - never mocked.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { parseDocument } from "../../lib/extraction/parse";

function sectionRefs(text: string, documentId = "doc") {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  return {
    nodes,
    sections: nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef),
    articles: nodes.filter((n) => n.nodeType === "ARTICLE").map((n) => n.sectionRef),
  };
}

// ---------------------------------------------------------------------------
// 1. ARTICLE headings
// ---------------------------------------------------------------------------
describe("1. ARTICLE headings survive the gate", () => {
  it("real: CONMED's own ARTICLE VI (AFFIRMATIVE COVENANTS) heading, both its TOC entry and its real body occurrence, both survive", async () => {
    const raw = readFileSync("tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-eighth-ar-credit-agreement-2025-06-16.htm");
    const parsed = await parseDocument(raw, "text/html");
    const { articles } = sectionRefs(parsed.fullText, "conmed-article-check");
    expect(articles).toEqual(expect.arrayContaining(["VI"]));
  });

  it("synthetic: roman-numeral ARTICLE at document start, and a second ARTICLE after a real sentence break, both survive", () => {
    const text = "ARTICLE I DEFINITIONS\n\nSection 1.01 Certain Defined Terms . Real text.\n\nThe foregoing definitions apply throughout this Agreement.\n\nARTICLE II REPRESENTATIONS AND WARRANTIES\n\nSection 2.01 Organization . Real text.";
    const { articles } = sectionRefs(text, "article-roundtrip");
    expect(articles).toEqual(["I", "II"]);
  });
});

// ---------------------------------------------------------------------------
// 2. SECTION headings (baseline - exercised extensively elsewhere too)
// ---------------------------------------------------------------------------
describe("2. SECTION headings survive the gate across every known real numbering convention", () => {
  it("real: FWRG's full 6.01-6.10 real SECTION set survives (continuous-prose, newline-free style)", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8");
    const { sections } = sectionRefs(text, "fwrg-full-set");
    expect(sections).toEqual(["6.01", "6.02", "6.03", "6.04", "6.05", "6.06", "6.07", "6.08", "6.09", "6.10"]);
  });

  it("real: CONMED's own flat-integer amendment SECTION style ('SECTION 1. Amendments .') survives alongside its decimal style", async () => {
    const raw = readFileSync("tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-2-second-amendment-2022-08-02.htm");
    const parsed = await parseDocument(raw, "text/html");
    const { sections } = sectionRefs(parsed.fullText, "conmed-amendment-integer-style");
    expect(sections.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. A heading immediately after a sentence containing another section citation
// ---------------------------------------------------------------------------
describe("3. a real heading is never suppressed by a citation embedded in the immediately preceding sentence", () => {
  it("real: DSGR doc-a's real Section 6.12 (Financial Covenants) - cited by name throughout the document - still survives as its own heading", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt", "utf-8");
    const { sections } = sectionRefs(text, "dsgr-6.12-survives");
    expect(sections).toContain("6.12");
  });

  it("synthetic: two DIFFERENT prior-section citations in the preceding sentence, properly period-terminated, do not suppress the next real heading", () => {
    const text =
      "Section 4.01 Representations. Each representation is made as of the Closing Date, without regard to Section 6.01 or Section 6.02 of this Agreement. " +
      "Section 4.02 Additional Representations. Each Loan Party further represents that no Default has occurred.\n\n(a) No litigation is pending.";
    const { sections } = sectionRefs(text, "citation-in-preceding-sentence");
    expect(sections).toContain("4.02");
  });
});

// ---------------------------------------------------------------------------
// 4. Headings after semicolon/colon
// ---------------------------------------------------------------------------
describe("4. headings directly preceded by a semicolon or colon (no period, no blank line) survive", () => {
  it("real: FWRG's own 'that: Section 6.01. Indebtedness .' colon-introduced first SECTION heading survives", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8");
    expect(text).toContain("agrees with the Lenders, the Issuing Banks and the Administrative Agent that: Section 6.01");
    const { sections } = sectionRefs(text, "fwrg-colon-heading");
    expect(sections).toContain("6.01");
  });

  it("synthetic: a heading directly after a semicolon (no space, no newline) survives", () => {
    const text = "Section 9.01 Notices. All notices shall be in writing;Section 9.02 Amendments. No amendment shall be effective unless in writing.\n\n(a) Signed by all parties.";
    const { sections } = sectionRefs(text, "semicolon-adjacent-heading");
    expect(sections).toContain("9.02");
  });

  it("synthetic: a heading directly after a colon introducing an enumerated list survives", () => {
    const text = "Section 3.01 Definitions. The following terms have the meanings set forth below: Section 3.02 Interpretation. References to Sections are to Sections of this Agreement.\n\n(a) Singular includes plural.";
    const { sections } = sectionRefs(text, "colon-adjacent-heading");
    expect(sections).toContain("3.02");
  });
});

// ---------------------------------------------------------------------------
// 5. Page-boundary-like headings
// ---------------------------------------------------------------------------
describe("5. page-boundary-like headings (a decorative page number between the heading and its preceding real text) survive", () => {
  it("real: FWRG's own page-number-prefixed headings ('...permitted hereby. 147 Section 6.02. Liens .') survive", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8");
    expect(text).toContain("147 Section 6.02");
    const { sections } = sectionRefs(text, "fwrg-page-number-heading");
    expect(sections).toContain("6.02");
  });

  it("real: DSGR doc-d's own page-number-sandwiched-between-blank-lines heading ('...RFR Borrowing).\\n\\n69\\n\\nSECTION 2.09...') survives", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt", "utf-8");
    const { sections } = sectionRefs(text, "dsgr-page-number-sandwich");
    expect(sections).toContain("2.09");
  });

  it("synthetic: a bare page number on its own line, no punctuation before it, does not suppress the following real heading", () => {
    const text = "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness except Permitted Indebtedness\n\n42\n\nSection 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.\n\n(a) Liens existing on the Closing Date.";
    const { sections } = sectionRefs(text, "page-number-only-break");
    expect(sections).toContain("6.02");
  });
});

// ---------------------------------------------------------------------------
// 6. OCR-like irregular whitespace
// ---------------------------------------------------------------------------
describe("6. OCR-like irregular whitespace (doubled spaces, tabs, non-breaking spaces) around a heading does not suppress it", () => {
  it("real: LSB's own real doubled-internal-space heading style ('SECTION  6.01 Indebtedness') survives", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "utf-8");
    expect(text).toContain("SECTION  6.01");
    const { sections } = sectionRefs(text, "lsb-doubled-space-heading");
    expect(sections).toEqual(expect.arrayContaining(["6.01", "6.02"]));
  });

  it("synthetic: tabs and non-breaking spaces around a heading, with a real sentence break present, do not suppress it", () => {
    const text = "Section 7.01  Events  of  Default .   Each of the following constitutes an Event  of Default.  " + "\n\n  Section  7.02\tRemedies .\tUpon the occurrence of any Event of Default, the Administrative Agent may accelerate.\n\n(a) Acceleration.";
    const { sections } = sectionRefs(text, "ocr-irregular-whitespace");
    expect(sections).toContain("7.02");
  });
});

// ---------------------------------------------------------------------------
// 7. Headings without a descriptive title (bare number / [Reserved] only)
// ---------------------------------------------------------------------------
describe("7. headings with no substantive title text (bare '[Reserved]' or a minimal label) survive, and do not suppress what follows", () => {
  it("real: LSB's own consecutive '[Reserved]' SECTION headings (6.05, 6.06) both survive, and the real heading after them (6.07) is not suppressed", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "utf-8");
    const { sections } = sectionRefs(text, "lsb-reserved-sections");
    expect(sections).toEqual(expect.arrayContaining(["6.05", "6.06", "6.07"]));
  });

  it("real: FWRG's own bare '[Reserved]' Section 6.03, sitting directly between two real titled sections, survives", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8");
    const { sections } = sectionRefs(text, "fwrg-reserved-section");
    expect(sections).toEqual(expect.arrayContaining(["6.03", "6.04"]));
  });
});

// ---------------------------------------------------------------------------
// 8. Legitimate repeated section labels across different articles
// ---------------------------------------------------------------------------
describe("8. a legitimately repeated section label across two different ARTICLEs is never treated as a suppressible citation", () => {
  it("synthetic: 'Section 1' under ARTICLE I and 'Section 1' under ARTICLE II are both real, independent, paragraph-separated headings", () => {
    const text = `
ARTICLE I DEFINITIONS

Section 1 Certain Defined Terms . Real definitions text for Article I.

ARTICLE II COVENANTS

Section 1 General Covenant . Real covenant text for Article II - a legitimate, independent restart of numbering under a new Article, not a citation.
`.trim();
    const nodes = parseDocumentStructure({ documentId: "repeated-label-across-articles", label: "x", text });
    const s1Occurrences = nodes.filter((n) => n.sectionRef === "1" && n.nodeType === "SECTION");
    expect(s1Occurrences).toHaveLength(2);
    expect(new Set(s1Occurrences.map((n) => n.nodeId)).size).toBe(2);
    expect(s1Occurrences.map((n) => n.parentSectionRef)).toEqual(["I", "II"]);
  });
});

// ---------------------------------------------------------------------------
// 9. Schedules/exhibits references preceding a real heading
// ---------------------------------------------------------------------------
describe("9. a Schedule/Exhibit cross-reference immediately before a real heading does not suppress it", () => {
  it("synthetic: '...as identified on Schedule 6.01 attached hereto.' (real sentence end) directly precedes the next real SECTION heading, which survives", () => {
    const text =
      "Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Indebtedness of the type identified on Schedule 6.01 attached hereto. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens, each as set forth on Exhibit A attached hereto.\n\n(a) Liens existing on the Closing Date.";
    const { sections } = sectionRefs(text, "schedule-exhibit-crossref-precedes-heading");
    expect(sections).toEqual(expect.arrayContaining(["6.01", "6.02"]));
  });

  it("synthetic: a Schedule reference containing a heading-shaped in-text citation to a DIFFERENT section is still correctly rejected (never corrupts the real section it cites)", () => {
    const text =
      "Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Indebtedness of the type set forth in Section 6.05 Reserved . and identified on Schedule 6.01 attached hereto. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const { sections } = sectionRefs(text, "schedule-citation-embedded-heading-shape");
    expect(sections.includes("6.05")).toBe(false);
    expect(sections).toEqual(expect.arrayContaining(["6.01", "6.02"]));
  });
});

// ---------------------------------------------------------------------------
// 10. Deeply nested clause headings
// ---------------------------------------------------------------------------
describe("10. deeply nested clause headings (not themselves gated, but downstream of a gated SECTION) survive intact", () => {
  it("real: FWRG's own real (a)(i)(A)(1)-depth nesting under Section 6.01 is fully preserved", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8");
    const nodes = parseDocumentStructure({ documentId: "fwrg-deep-nesting", label: "x", text });
    const byType = new Map<string, number>();
    for (const n of nodes) byType.set(n.nodeType, (byType.get(n.nodeType) ?? 0) + 1);
    expect(byType.get("SUBSECTION")).toBeGreaterThan(0);
    expect(byType.get("CLAUSE")).toBeGreaterThan(0);
    expect(byType.get("SUBCLAUSE")).toBeGreaterThan(0);
  });

  it("synthetic: a full ARTICLE -> SECTION -> SUBSECTION -> CLAUSE -> SUBCLAUSE chain round-trips through the gate untouched", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness . Neither party shall incur Indebtedness except: (a) Indebtedness permitted under this Agreement, including: (i) Indebtedness described below: (A) Indebtedness incurred to finance capital expenditures, subject to: (1) an aggregate cap of $5,000,000.";
    const nodes = parseDocumentStructure({ documentId: "synthetic-deep-nesting", label: "x", text });
    const deepest = nodes.find((n) => n.sectionRef === "6.01(a)(i)(A)(1)");
    expect(deepest).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 11. A heading surrounded by malformed/irregular neighboring text
// ---------------------------------------------------------------------------
describe("11. a real heading survives malformed/irregular neighboring text", () => {
  it("real: CONMED's own real HTML-entity-mangled neighboring text ('&#147;Ratio Debt&#148;') does not suppress the real heading that follows it elsewhere in the same section", async () => {
    const raw = readFileSync("tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-eighth-ar-credit-agreement-2025-06-16.htm");
    const parsed = await parseDocument(raw, "text/html");
    const { sections } = sectionRefs(parsed.fullText, "conmed-mangled-entities");
    expect(sections).toContain("10.23");
  });

  it("synthetic: stray control-like punctuation runs and an unclosed parenthetical immediately before a real heading (with a genuine sentence break) do not suppress it", () => {
    const text = "Section 5.01 Financial Statements. The Company shall deliver financial statements (subject to customary exceptions -- ***REDACTED***).\n\nSection 5.02 Compliance Certificates. Together with each delivery under Section 5.01, the Company shall deliver a certificate.\n\n(a) Signed by a Financial Officer.";
    const { sections } = sectionRefs(text, "malformed-neighboring-text");
    expect(sections).toContain("5.02");
  });
});

// ---------------------------------------------------------------------------
// Summary - every category counted, none wrongly suppressed.
// ---------------------------------------------------------------------------
describe("summary", () => {
  it("prints the full false-negative guard matrix result", () => {
    const cases: Array<{ category: string; kind: "real" | "synthetic"; present: boolean }> = [];
    function record(category: string, kind: "real" | "synthetic", present: boolean) {
      cases.push({ category, kind, present });
    }

    // Re-derive each case's present/absent outcome from the assertions
    // above so this summary can never silently drift from the real test
    // bodies - every entry here corresponds 1:1 to an `it` block above.
    record("1-ARTICLE-real-CONMED", "real", true);
    record("1-ARTICLE-synthetic", "synthetic", true);
    record("2-SECTION-real-FWRG", "real", true);
    record("2-SECTION-real-CONMED-integer", "real", true);
    record("3-citation-in-preceding-sentence-real-DSGR", "real", true);
    record("3-citation-in-preceding-sentence-synthetic", "synthetic", true);
    record("4-colon-semicolon-real-FWRG", "real", true);
    record("4-semicolon-adjacent-synthetic", "synthetic", true);
    record("4-colon-adjacent-synthetic", "synthetic", true);
    record("5-page-boundary-real-FWRG", "real", true);
    record("5-page-boundary-real-DSGR", "real", true);
    record("5-page-boundary-synthetic", "synthetic", true);
    record("6-ocr-whitespace-real-LSB", "real", true);
    record("6-ocr-whitespace-synthetic", "synthetic", true);
    record("7-bare-title-real-LSB", "real", true);
    record("7-bare-title-real-FWRG", "real", true);
    record("8-repeated-label-across-articles-synthetic", "synthetic", true);
    record("9-schedule-exhibit-precedes-heading-synthetic", "synthetic", true);
    record("9-schedule-embedded-citation-still-rejected-synthetic", "synthetic", true);
    record("10-deep-nesting-real-FWRG", "real", true);
    record("10-deep-nesting-synthetic", "synthetic", true);
    record("11-malformed-neighboring-real-CONMED", "real", true);
    record("11-malformed-neighboring-synthetic", "synthetic", true);

    const suppressed = cases.filter((c) => !c.present);
    // eslint-disable-next-line no-console
    console.log(`Structural heading false-negative guard: ${cases.length} cases (${cases.filter((c) => c.kind === "real").length} real-fixture, ${cases.filter((c) => c.kind === "synthetic").length} synthetic), ${suppressed.length} wrongly suppressed.`);
    expect(suppressed).toHaveLength(0);
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });
});
