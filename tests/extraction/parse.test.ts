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

  it("throws loudly on an unsupported content type instead of silently returning empty text", async () => {
    await expect(parseDocument(Buffer.from("whatever"), "application/x-unknown")).rejects.toThrow(/unsupported contentType/);
  });
});
