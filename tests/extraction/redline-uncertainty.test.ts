/**
 * Redline uncertainty propagation, extraction level — RELEASE-LINE
 * PORT of the PR #428 test suite (same fixtures and assertions,
 * plus release-specific pins marked [release] below).
 *
 * An unmatched struck-through element (<strike>/<s>/<del> or a
 * line-through styled element whose close tag never appears) is
 * ambiguous: the drafter may have meant everything after it
 * deleted, or the tag may be a conversion artifact. Before this
 * change the surviving text was indistinguishable from clean
 * operative text, so downstream stages could mint authoritative
 * conclusions from possibly-deleted text.
 *
 * The contract pinned here: the text is PRESERVED verbatim (the
 * extraction output is byte-identical to the pre-change behavior —
 * evidence is never destroyed on a guess), and the ambiguity is
 * RECORDED as a span with a named reason, located in the extracted
 * text, so items intersecting it can be flagged and gated.
 *
 * All fixtures are synthetic — invented clauses, invented figures.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeStruckHtml,
  dropStruckHtml,
  findUnmatchedStruckSpans,
  locateTextSpan,
} from "../../lib/extraction/html-hardening";
import { parseDocument } from "../../lib/extraction/parse";

const HEAD = `<p>Section 7.02. Indebtedness. The Borrower shall not incur any Indebtedness other than:</p>`;
const CLAUSE_A = `<p>(a) Indebtedness under the Credit Facilities in an aggregate principal amount not to exceed $25,000,000 at any time outstanding;</p>`;
const CAP40 = `(b) Indebtedness in respect of purchase money obligations in an aggregate principal amount not to exceed $40,000,000 at any time outstanding;`;
const CLAUSE_C = `<p>(c) intercompany Indebtedness among Loan Parties;</p>`;
const CLAUSE_D = `<p>(d) Indebtedness in respect of hedging obligations incurred in the ordinary course.</p>`;

describe("findUnmatchedStruckSpans — malformed redline variants", () => {
  it("unclosed <strike>: one span, bounded by the enclosing block, content preserved", () => {
    const html = `${HEAD}${CLAUSE_A}<p><strike>${CAP40}</p>${CLAUSE_C}${CLAUSE_D}`;
    const { html: out, unmatched } = analyzeStruckHtml(html);
    expect(out).toBe(dropStruckHtml(html)); // analyze wrapper never changes the text
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.tagName).toBe("strike");
    expect(unmatched[0]!.styled).toBe(false);
    expect(unmatched[0]!.innerHtml).toContain("$40,000,000");
    // Bounded by the block: clauses (c) and (d) are NOT swept in.
    expect(unmatched[0]!.innerHtml).not.toContain("intercompany");
    expect(unmatched[0]!.innerHtml).not.toContain("hedging");
    // The ambiguous text stays in the output (evidence preserved).
    expect(out).toContain("$40,000,000");
  });

  it("unclosed <s> and unclosed <del> are recorded the same way", () => {
    for (const tag of ["s", "del"] as const) {
      const html = `${HEAD}${CLAUSE_A}<p><${tag}>${CAP40}</p>${CLAUSE_C}`;
      const { unmatched } = analyzeStruckHtml(html);
      expect(unmatched).toHaveLength(1);
      expect(unmatched[0]!.tagName).toBe(tag);
      expect(unmatched[0]!.innerHtml).toContain("$40,000,000");
    }
  });

  it("mismatched nesting (<strike> ... </s>): the stray close ends the span", () => {
    const html = `${HEAD}${CLAUSE_A}<p><strike>${CAP40}</s> tail text</p>${CLAUSE_C}`;
    const { unmatched } = analyzeStruckHtml(html);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.tagName).toBe("strike");
    expect(unmatched[0]!.innerHtml).toContain("$40,000,000");
    expect(unmatched[0]!.innerHtml).not.toContain("tail text");
  });

  it("unclosed line-through styled element: recorded with styled=true", () => {
    const html = `${HEAD}${CLAUSE_A}<p><span style="text-decoration: line-through">${CAP40}</p>${CLAUSE_C}`;
    const { unmatched } = analyzeStruckHtml(html);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.tagName).toBe("span");
    expect(unmatched[0]!.styled).toBe(true);
    expect(unmatched[0]!.innerHtml).toContain("$40,000,000");
  });

  it("unclosed <strike> at end of document: recorded with empty content, taints nothing", () => {
    const html = `${HEAD}${CLAUSE_A}${CLAUSE_C}<strike>`;
    const { unmatched } = analyzeStruckHtml(html);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.innerHtml.trim()).toBe("");
  });

  it("a well-formed struck element inside an ambiguous span is still dropped, not recorded", () => {
    // The <del> is properly closed, so its content is deleted text
    // by deterministic markup — it must not appear in the span.
    const html = `${HEAD}<p><strike>deleted-intent one <del>deleted-intent two</del> deleted-intent three not to exceed $40,000,000</p>${CLAUSE_C}`;
    const { html: out, unmatched } = analyzeStruckHtml(html);
    expect(out).not.toContain("deleted-intent two");
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.innerHtml).toContain("deleted-intent three");
    expect(unmatched[0]!.innerHtml).not.toContain("deleted-intent two");
  });

  it("two unmatched opens in different blocks produce two spans", () => {
    const html = `${HEAD}<p><strike>first deleted-intent block</p><p>clean middle clause</p><p><del>second deleted-intent block</p>`;
    const { unmatched } = analyzeStruckHtml(html);
    expect(unmatched).toHaveLength(2);
    expect(unmatched[0]!.innerHtml).toContain("first deleted-intent block");
    expect(unmatched[1]!.innerHtml).toContain("second deleted-intent block");
  });

  it("properly closed struck elements and clean documents record no spans", () => {
    const closed = `${HEAD}${CLAUSE_A}<p><strike>${CAP40}</strike></p>${CLAUSE_C}`;
    expect(findUnmatchedStruckSpans(dropStruckHtml(closed))).toEqual([]);
    expect(analyzeStruckHtml(closed).unmatched).toEqual([]);
    const clean = `${HEAD}${CLAUSE_A}<p>${CAP40}</p>${CLAUSE_C}`;
    expect(analyzeStruckHtml(clean).unmatched).toEqual([]);
  });

  it("[release] properly closed line-through styled elements are dropped like struck tags", () => {
    // PR #427 (this tree's previous state) matched only strike/s/del
    // TAGS: styled deletions stayed fully operative with no signal.
    // A properly closed styled element is deterministic deletion
    // markup — dropped, and nothing is recorded (no ambiguity).
    const styledSpan = `${HEAD}${CLAUSE_A}<p><span style="text-decoration: line-through">${CAP40}</span></p>${CLAUSE_C}`;
    const a = analyzeStruckHtml(styledSpan);
    expect(a.unmatched).toEqual([]);
    expect(a.html).not.toContain("$40,000,000");
    const styledBlock = `${HEAD}${CLAUSE_A}<p style="text-decoration: line-through">${CAP40}</p>${CLAUSE_C}`;
    const b = analyzeStruckHtml(styledBlock);
    expect(b.unmatched).toEqual([]);
    expect(b.html).not.toContain("$40,000,000");
    expect(b.html).toContain("$25,000,000");
  });

  it("[release] nested struck elements drop whole — no tail leaks as operative", () => {
    // PR #427's regex dropped non-greedily to the FIRST same-name
    // close, so the tail after an inner close ("deleted-intent
    // three") survived as operative text. Balanced dropping takes
    // the whole element.
    const html = `${HEAD}${CLAUSE_A}<p><strike>deleted-intent one <strike>deleted-intent two</strike> deleted-intent three</strike></p>${CLAUSE_C}`;
    const { html: out, unmatched } = analyzeStruckHtml(html);
    expect(unmatched).toEqual([]);
    expect(out).not.toContain("deleted-intent");
    expect(out).toContain("$25,000,000");
    expect(out).toContain("intercompany");
  });

  it("[release] a clause-crossing strike that IS closed drops through its close", () => {
    // Deterministic markup: a matched strike deletes everything up
    // to its balancing close, even across block boundaries (the
    // intervening clause was inside the deletion). Contrast with
    // the UNMATCHED cases above, whose spans stop at block
    // boundaries because nothing proves how far they reach.
    const html = `${HEAD}${CLAUSE_A}<p><strike>${CAP40}</p>${CLAUSE_C}<p>(d) hedging obligations.</strike></p>`;
    const { html: out, unmatched } = analyzeStruckHtml(html);
    expect(unmatched).toEqual([]);
    expect(out).not.toContain("$40,000,000");
    expect(out).not.toContain("intercompany");
    expect(out).toContain("$25,000,000");
  });
});

describe("parseDocument — redlineAmbiguities record", () => {
  it("records the span in fullText coordinates; the ambiguous text stays in the text", async () => {
    const html = `${HEAD}${CLAUSE_A}<p><strike>${CAP40}</p>${CLAUSE_C}${CLAUSE_D}`;
    const doc = await parseDocument(Buffer.from(html, "utf-8"), "text/html");
    expect(doc.redlineAmbiguities).toHaveLength(1);
    const span = doc.redlineAmbiguities![0]!;
    expect(span.reason).toBe("UNMATCHED_REDLINE_ELEMENT");
    expect(span.tagName).toBe("strike");
    expect(span.text).toContain("$40,000,000");
    expect(span.start).toBeGreaterThanOrEqual(0);
    expect(doc.fullText.slice(span.start, span.end)).toBe(span.text);
    // Evidence preserved: the possibly-deleted cap is still visible
    // in the text — flagged, not erased and not silently operative.
    expect(doc.fullText).toContain("$40,000,000");
    // Text after the ambiguous block is outside the span.
    expect(span.text).not.toContain("intercompany");
  });

  it("properly closed strike: no record, struck text excluded cleanly", async () => {
    const html = `${HEAD}${CLAUSE_A}<p><strike>${CAP40}</strike></p>${CLAUSE_C}`;
    const doc = await parseDocument(Buffer.from(html, "utf-8"), "text/html");
    expect(doc.redlineAmbiguities).toEqual([]);
    expect(doc.fullText).not.toContain("$40,000,000");
    expect(doc.fullText).toContain("$25,000,000");
  });

  it("no strike at all: no record, all text operative", async () => {
    const html = `${HEAD}${CLAUSE_A}<p>${CAP40}</p>${CLAUSE_C}`;
    const doc = await parseDocument(Buffer.from(html, "utf-8"), "text/html");
    expect(doc.redlineAmbiguities).toEqual([]);
    expect(doc.fullText).toContain("$40,000,000");
  });
});

describe("[release] byte-for-byte control — well-formed documents are untouched", () => {
  it("a no-strike document's extracted text is exactly the pre-port text", async () => {
    // This test uses no post-port API: it must ALSO pass on the
    // pre-port tree, pinning that the port changed nothing for
    // well-formed documents (verified in the stream's fail-before
    // run, where it is the single passing test in this file).
    const html = `${HEAD}${CLAUSE_A}<p>${CAP40}</p>${CLAUSE_C}`;
    const doc = await parseDocument(Buffer.from(html, "utf-8"), "text/html");
    expect(doc.fullText).toBe(
      [
        "Section 7.02. Indebtedness. The Borrower shall not incur any Indebtedness other than:",
        "(a) Indebtedness under the Credit Facilities in an aggregate principal amount not to exceed $25,000,000 at any time outstanding;",
        "(b) Indebtedness in respect of purchase money obligations in an aggregate principal amount not to exceed $40,000,000 at any time outstanding;",
        "(c) intercompany Indebtedness among Loan Parties;",
      ].join("\n"),
    );
  });
});

describe("locateTextSpan", () => {
  it("finds a needle across whitespace differences and returns original offsets", () => {
    const haystack = "alpha beta\n\n  gamma   delta\nomega";
    const loc = locateTextSpan(haystack, "beta gamma delta");
    expect(loc).not.toBeNull();
    expect(haystack.slice(loc!.start, loc!.end)).toBe("beta\n\n  gamma   delta");
  });

  it("returns null when the needle's words do not appear", () => {
    expect(locateTextSpan("alpha beta", "gamma delta")).toBeNull();
    expect(locateTextSpan("alpha beta", "")).toBeNull();
  });
});
