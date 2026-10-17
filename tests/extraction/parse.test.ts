/**
 * lib/extraction/parse.ts - real parsing against real (small, hand-built)
 * PDF/DOCX/TXT files, not stubs. tests/extraction/fixtures/build-pdf.ts and
 * build-docx.ts construct byte-accurate minimal files that unpdf/mammoth
 * have to actually parse.
 */
import { describe, expect, it } from "vitest";
import { parseDocument } from "../../lib/extraction/parse";
import { buildMinimalDocx } from "./fixtures/build-docx";
import { buildMinimalPdf } from "./fixtures/build-pdf";

describe("parseDocument", () => {
  it("parses a real PDF with unpdf, preserving per-page text", async () => {
    const pdf = buildMinimalPdf(["Hello Headroom Test", "Second page content"]);
    const parsed = await parseDocument(pdf, "application/pdf");

    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages[0]!.pageNumber).toBe(1);
    expect(parsed.pages[0]!.text).toContain("Hello Headroom");
    expect(parsed.pages[1]!.pageNumber).toBe(2);
    expect(parsed.pages[1]!.text).toContain("Second page");
    expect(parsed.fullText).toContain("Hello Headroom");
    expect(parsed.fullText).toContain("Second page");
  });

  it("respects a PDF content-type with parameters (e.g. a charset suffix)", async () => {
    const pdf = buildMinimalPdf(["Only page"]);
    const parsed = await parseDocument(pdf, "application/pdf; charset=binary");
    expect(parsed.pages).toHaveLength(1);
  });

  it("parses a real DOCX with mammoth as a single un-paged document", async () => {
    const docx = await buildMinimalDocx(["ARTICLE I", "DEFINITIONS", 'SECTION 1.01. "Consolidated EBITDA" means for any period...']);
    const parsed = await parseDocument(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0]!.pageNumber).toBe(1);
    expect(parsed.fullText).toContain("ARTICLE I");
    expect(parsed.fullText).toContain("DEFINITIONS");
    expect(parsed.fullText).toContain("Consolidated EBITDA");
  });

  it("reads a TXT file directly", async () => {
    const parsed = await parseDocument(Buffer.from("SECTION 6.01. Indebtedness.\nplain text body", "utf-8"), "text/plain");
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.fullText).toBe("SECTION 6.01. Indebtedness.\nplain text body");
  });

  it("decodes hex numeric HTML entities (&#x…;) in EDGAR HTML, not just decimal ones", async () => {
    // Grok accuracy check 2026-10-17: filings encode quoted defined
    // terms as &#x201C;…&#x201D;; undecoded, the quotes never match and
    // ratio definitions come back "not in bound texts".
    const html = "<html><body><p>&#x201C;Consolidated EBITDA&#x201D; means, for any period, &#x2026;</p></body></html>";
    const parsed = await parseDocument(Buffer.from(html, "utf-8"), "text/html");
    expect(parsed.fullText).toContain("“Consolidated EBITDA”");
    expect(parsed.fullText).not.toContain("&#x");
  });

  it("drops struck (blackline-deleted) text from EDGAR HTML instead of treating it as operative", async () => {
    // Synthetic figures only (Grok cross-review on PR #428, 2026-10-17:
    // the previous figures came from the accuracy-census sample, which is
    // contaminated for tuning and must not be baked into a regression test).
    // The deleted $43,000,000 is not the operative cap; $68,500,000 is.
    const html =
      "<html><body><p>General basket shall not exceed <strike>$43,000,000</strike> $68,500,000</p>" +
      "<p><del>removed clause</del> <s>also removed</s> surviving clause</p></body></html>";
    const parsed = await parseDocument(Buffer.from(html, "utf-8"), "text/html");
    expect(parsed.fullText).toContain("$68,500,000");
    expect(parsed.fullText).not.toContain("43,000,000");
    expect(parsed.fullText).not.toContain("removed clause");
    expect(parsed.fullText).toContain("surviving clause");
  });

  it("throws loudly on an unsupported content type instead of silently returning empty text", async () => {
    await expect(parseDocument(Buffer.from("whatever"), "application/x-unknown")).rejects.toThrow(/unsupported contentType/);
  });
});
