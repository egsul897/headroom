/**
 * Extraction hardening (synthetic HTML only): struck-through text is deleted
 * text and is dropped; hex and decimal numeric references decode; the colon
 * definition convention ("Term": ...) is indexed like "Term" means ....
 */
import { describe, expect, it } from "vitest";
import { decodeNumericEntities, dropStruckHtml } from "../../lib/extraction/html-hardening";
import { parseDocument } from "../../lib/extraction/parse";
import { stripHtmlPreserveStructure } from "../../lib/contract-model/compiler/deterministic-extraction/html-text";
import { definedTerms } from "../../lib/contract-model/section-tree/semantics";
import { parseSectionTree } from "../../lib/contract-model/section-tree/parse";

const html = (body: string) => Buffer.from(`<html><body>${body}</body></html>`, "utf-8");
const text = async (body: string) => (await parseDocument(html(body), "text/html")).fullText;

describe("dropStruckHtml", () => {
  it("drops <s>, <strike> and <del> with their content and keeps <ins>", async () => {
    const t = await text(
      `<p>Indebtedness in an aggregate amount not to exceed <s>$10,000,000</s><ins>$20,000,000</ins> at any time.</p>` +
        `<p>The Applicable Rate is <strike>2.00%</strike> 1.75%; the fee is <del datetime="x">0.50%</del> 0.25%.</p>`,
    );
    expect(t).toContain("not to exceed $20,000,000 at any time");
    expect(t).not.toContain("$10,000,000");
    expect(t).toContain("is 1.75%");
    expect(t).not.toContain("2.00%");
    expect(t).not.toContain("0.50%");
  });

  it("drops line-through styled spans, including nested markup, and keeps underline insertions", async () => {
    const t = await text(
      `<p>General basket: the greater of <font style="font-family:Times; text-decoration: line-through">$35,000,000 <span><b>and 15%</b> of EBITDA</span></font>` +
        `<font style="text-decoration:underline">$50,000,000 and 25% of Consolidated EBITDA</font>.</p>`,
    );
    expect(t).toContain("the greater of $50,000,000 and 25% of Consolidated EBITDA");
    expect(t).not.toMatch(/35,000,000|15%/);
  });

  it("handles text-decoration-line and single-quoted styles", () => {
    expect(dropStruckHtml(`a<span style='text-decoration-line: line-through'>gone</span>b`)).toBe("a b");
  });

  it("leaves an unclosed struck element in place instead of deleting the rest of the document", () => {
    const src = `<p>keep <s>unterminated text and everything after</p>`;
    expect(dropStruckHtml(src)).toBe(src);
  });

  it("does not confuse <span>, <sup>, <section> or <small> with <s>", () => {
    const src = `<section><span>a</span><sup>1</sup><small>b</small></section>`;
    expect(dropStruckHtml(src)).toBe(src);
  });

  it("applies in the structure-preserving stripper used by the section tree and baskets", () => {
    const out = stripHtmlPreserveStructure(`<p>Cap of <s>$75,000,000</s> $100,000,000.</p><p>&#x201C;Term&#x201D; means x.</p>`);
    expect(out).not.toContain("75,000,000");
    expect(out).toContain("$100,000,000");
    expect(out).toContain("\u201cTerm\u201d means x.");
  });
});

describe("decodeNumericEntities", () => {
  it("decodes hex and decimal references, upper and lower case", async () => {
    expect(decodeNumericEntities("&#x201C;EBITDA&#x201d; &#8220;Net&#8221; &#X2014; &#xA0;")).toBe("\u201cEBITDA\u201d \u201cNet\u201d \u2014 \u00a0");
    const t = await text(`<p>&#x201C;Consolidated EBITDA&#x201D; means, for any period&#x2014;</p><p>&sect; 7.01 &amp; more&hellip;</p>`);
    expect(t).toContain("\u201cConsolidated EBITDA\u201d means, for any period\u2014");
    expect(t).toContain("\u00a7 7.01 & more\u2026");
  });

  it("turns invalid code points into a space and decodes astral ones", () => {
    expect(decodeNumericEntities("a&#xD800;b&#0;c&#x1F600;")).toBe("a b c\u{1F600}");
  });
});

describe("definedTerms: colon convention", () => {
  it("indexes \u201cTerm\u201d: definitions alongside \u201cTerm\u201d means", () => {
    const t = [
      "ARTICLE I",
      "DEFINITIONS",
      "Section 1.01 Defined Terms. As used in this Agreement:",
      "\u201cApplicable Margin\u201d: for any day, 2.00% per annum.",
      "\u201cConsolidated EBITDA\u201d means, for any period, Consolidated Net Income plus the following.",
      "\"Fixed Charges\" : for any period, the sum of interest expense.",
      "Notices shall be given as follows: \u201cAttention\u201d:Treasurer.",
    ].join("\n");
    const terms = definedTerms(parseSectionTree(t), t).map((d) => d.term);
    expect(terms).toEqual(expect.arrayContaining(["Applicable Margin", "Consolidated EBITDA", "Fixed Charges"]));
    // A colon that is not followed by whitespace is not the definition convention.
    expect(terms).not.toContain("Attention");
  });
});
