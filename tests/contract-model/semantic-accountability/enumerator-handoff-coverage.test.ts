/**
 * DEFECT A of the §7.5(j) live-exposed deterministic closure - LEADING BARE ENUMERATOR HANDOFF (semantic-accountability.v7).
 *
 * Live defect: the frozen operative text begins "(j)\nany Disposition of Property or business ..." and a CRITICAL item
 * spans [0,132). `independentSegmentBounds` treats the line break after "(j)" as an independent-segment boundary and
 * `clipCreditToStartSegment` therefore spent the item's one credit segment on the enumerator, leaving the substantive text
 * the item anchors UNACCOUNTED ([4,43) and [104,132)) - a false coverage gap. The clipping rule itself (canary #3) stays:
 * one item never discharges several INDEPENDENT propositions. The exception is narrow and positively proven.
 */
import { describe, expect, it } from "vitest";
import { computeSourceCoverage, isBareEnumeratorFormatting, type AccountingSpanInput } from "../../../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { SourceContextRegion } from "../../../lib/contract-model/compiler/semantic-accountability/types";

const region = (text: string): SourceContextRegion => ({ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null });
function cover(text: string, spans: [number, number][], materiality = "CRITICAL") {
  const c = computeSourceCoverage({ regions: [region(text)], spans: spans.map(([charStart, charEnd]): AccountingSpanInput => ({ regionId: "operative", charStart, charEnd, materiality })) });
  return { ...c, unaccountedText: c.unaccounted.map((s) => s.excerpt), coveredText: c.spans.filter((s) => s.disposition === "COVERED_BY_INVENTORY").map((s) => s.excerpt) };
}
const whole = (text: string): [number, number] => [0, text.length];

describe("defect A - a bare enumerator on its own line does not consume an item's single credit segment", () => {
  it("version: the accountability algorithm is v7", () => {
    expect(SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION).toBe("semantic-accountability.v7");
  });

  it("A1: '(j)\\nsubstantive covenant language' - one item from (j) covers both; the substantive segment is COVERED_BY_INVENTORY", () => {
    const text = "(j)\nthe Borrower may dispose of property or business";
    const cov = cover(text, [whole(text)]);
    expect(cov.unaccounted).toEqual([]);
    expect(cov.coveredText.join("")).toBe(text);
  });

  it("A2: '(j)\\nfirst proposition.\\nsecond independent proposition.' - one item spanning all covers the first proposition only; the second stays UNACCOUNTED", () => {
    const text = "(j)\nthe Borrower may dispose of property.\nthe Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00.";
    const cov = cover(text, [whole(text)]);
    expect(cov.coveredText.join("")).toBe("(j)\nthe Borrower may dispose of property.\n");
    expect(cov.unaccountedText).toEqual(["the Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00."]);
    expect(cov.unaccountedValues.map((v) => v.kind)).toEqual(["RATIO"]);
    // independently anchored, the second proposition is covered - the handoff never did that for it
    expect(cover(text, [whole(text), [text.indexOf("the Borrower shall"), text.length]]).unaccounted).toEqual([]);
  });

  it("A3: '(j) substantive covenant language' - enumerator and substance in one segment: no handoff, ordinary clipping", () => {
    const text = "(j) the Borrower may dispose of property. The Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00.";
    const cov = cover(text, [whole(text)]);
    expect(cov.coveredText.join("")).toBe("(j) the Borrower may dispose of property. ");
    expect(cov.unaccountedText).toEqual(["The Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00."]);
  });

  it("A4: segmentation policy - a line break is an independent-segment boundary (audit finding 7: a table row / bulleted basket is not one unit), so a wrapped continuation line is NOT credited by the handoff and needs its own anchor", () => {
    // Why each boundary is or is not independent: "(j)\n" -> the line break is a boundary, but the segment it closes is
    // bare enumerator formatting, so the handoff advances past it; "first proposition\n" -> the line break is a boundary
    // and the segment it closes is substantive, so credit stops there; the wrapped line is a further independent segment
    // that no deterministic rule can prove belongs to the same proposition (the layer reads structure, not meaning), so
    // it stays UNACCOUNTED unless an item anchors it - exactly what the frozen §7.5(j) inventory did with its item 4 on
    // "the Parent Borrower or any of its Subsidiaries ...". No document-specific wrapping heuristic exists or is wanted.
    const text = "(j)\nany Disposition of Property which yields net proceeds to\nthe Borrower or any of its Subsidiaries";
    const cov = cover(text, [whole(text)]);
    expect(cov.coveredText.join("")).toBe("(j)\nany Disposition of Property which yields net proceeds to\n");
    expect(cov.unaccountedText).toEqual(["the Borrower or any of its Subsidiaries"]);
    expect(cover(text, [whole(text), [text.indexOf("the Borrower"), text.length]]).unaccounted).toEqual([]);
  });

  it("A5: a page number or arbitrary bare number on its own line is not an enumerator handoff", () => {
    expect(isBareEnumeratorFormatting("12\n")).toBe(false);
    expect(isBareEnumeratorFormatting("Page 12\n")).toBe(false);
    expect(isBareEnumeratorFormatting("- 12 -\n")).toBe(false);
    const pageFirst = "12\nthe Borrower may dispose of property";
    const cov = cover(pageFirst, [whole(pageFirst)]);
    expect(cov.unaccountedText).toEqual(["the Borrower may dispose of property"]);
    // an enumerator followed by a bare number line: the handoff target must be substantive by the detector's own
    // verdict, and a lone number is not - no hop onto it, and certainly no hop over it to the text beyond
    const pageBetween = "(j)\n12\nthe Borrower may dispose of property";
    const cov2 = cover(pageBetween, [whole(pageBetween)]);
    expect(cov2.coveredText.join("")).toBe("(j)\n");
    expect(cov2.unaccountedText.join(" ")).toContain("the Borrower may dispose of property");
    // a caption line is not substantive either (HEADING_OR_LABEL by the existing classifier): no hop onto or over it
    const headingBetween = "(j)\nSECTION 7.5 Limitation on Sale of Assets\nthe Borrower may dispose of property";
    const cov3 = cover(headingBetween, [whole(headingBetween)]);
    expect(cov3.coveredText.join("")).toBe("(j)\n");
    expect(cov3.unaccountedText.join(" ")).toContain("the Borrower may dispose of property");
    // recognised enumerator grammar only: "(j)", "(iv)", "(12)", "3." qualify; words, digits and currency do not
    expect(["(j)\n", "(iv) ", "(12)\n", "3. ", "(A)\n", "(j).\n"].map(isBareEnumeratorFormatting)).toEqual([true, true, true, true, true, true]);
    expect(["$5,000,000\n", "j\n", "(j) x", "(jklm)\n", ""].map(isBareEnumeratorFormatting)).toEqual([false, false, false, false, false]);
  });

  it("A6: an enumerated first segment that carries substantive words of its own is not formatting-only - no handoff", () => {
    const text = "(j) the Borrower shall\nnot incur Indebtedness. The cure period is 30 days.";
    const cov = cover(text, [whole(text)]);
    expect(isBareEnumeratorFormatting("(j) the Borrower shall\n")).toBe(false);
    expect(cov.coveredText.join("")).toBe("(j) the Borrower shall\n");
    expect(cov.unaccountedText.join(" ⋮ ")).toContain("not incur Indebtedness.");
    expect(cov.unaccountedText.join(" ⋮ ")).toContain("The cure period is 30 days.");
  });

  it("A7: the overbroad-anchor canaries still surface independent omitted propositions (canary #3 fixture, verbatim)", () => {
    const RT8 = "The Borrower shall not incur Indebtedness exceeding $10,000,000. The Borrower shall maintain a Leverage Ratio of not more than 4.00 to 1.00 as of the last day of each fiscal quarter. The cure period is 30 days.";
    const cov = cover(RT8, [whole(RT8)]);
    expect(cov.unaccounted.length).toBeGreaterThan(0);
    expect(cov.unaccountedText.join(" ")).toContain("Leverage Ratio");
    expect(cov.unaccountedText.join(" ")).toContain("cure period");
    expect(cov.unaccountedValues.map((v) => v.kind).sort()).toEqual(["DAYS", "RATIO"]);
    // the same attack behind an enumerator line: the handoff reaches ONE proposition, never the second or third
    const enumerated = `(a)\n${RT8}`;
    const cov2 = cover(enumerated, [whole(enumerated)]);
    expect(cov2.coveredText.join("")).toBe("(a)\nThe Borrower shall not incur Indebtedness exceeding $10,000,000. ");
    expect(cov2.unaccountedValues.map((v) => v.kind).sort()).toEqual(["DAYS", "RATIO"]);
    // a blank line inside the formatting segment is whitespace, not a second hop; a second bare enumerator line is not a substantive target
    const blank = "(a)\n\nthe Borrower may dispose of property";
    expect(cover(blank, [whole(blank)]).unaccounted).toEqual([]);
    const twoEnumerators = "(a)\n(i)\nthe Borrower may dispose of property";
    expect(cover(twoEnumerators, [whole(twoEnumerators)]).coveredText.join("")).toBe("(a)\n");
    // only CRITICAL/MATERIAL items account for source; the handoff grants nothing to an INFORMATIONAL echo
    const t = "(j)\nthe Borrower may dispose of property";
    expect(cover(t, [whole(t)], "INFORMATIONAL").unaccountedText).toEqual(["the Borrower may dispose of property"]);
    // provenance is untouched: the handoff changes credit only (the function reads spans, never rewrites them)
    const spans: AccountingSpanInput[] = [{ regionId: "operative", charStart: 0, charEnd: t.length, materiality: "CRITICAL" }];
    computeSourceCoverage({ regions: [region(t)], spans });
    expect(spans).toEqual([{ regionId: "operative", charStart: 0, charEnd: t.length, materiality: "CRITICAL" }]);
  });

  it("determinism: identical inputs yield byte-identical coverage", () => {
    const text = "(j)\nany Disposition of Property or business which yields net proceeds to\nthe Borrower (valued at fair market value) of less than $25,000,000.";
    const a = JSON.stringify(cover(text, [[0, 72], [73, text.length]]));
    const b = JSON.stringify(cover(text, [[0, 72], [73, text.length]]));
    expect(a).toBe(b);
  });
});
