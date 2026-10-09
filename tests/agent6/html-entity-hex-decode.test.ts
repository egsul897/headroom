/**
 * Regression: EDGAR HTML exhibits commonly encode curly quotes as &#x201c; /
 * &#x201d;. stripHtmlPreserveStructure must decode hex numeric entities so
 * definition detectors see real quotation marks — surfaced on authentic
 * Benchmark Electronics Second A&R (Agent 6).
 */
import { describe, expect, it } from "vitest";
import { stripHtmlPreserveStructure } from "@/lib/contract-model/compiler/deterministic-extraction/html-text";
import { detectStructuralDefinitions } from "@/lib/contract-model/compiler/structural-definitions";
import { runStructureStage } from "@/lib/contract-model/compiler/stage-structure";

describe("Agent 6 — HTML hex entity decode (generalizable)", () => {
  it("decodes &#x201c;/&#x201d; into real quotation marks", () => {
    const html = `<p>&#x201c;Consolidated EBITDA&#x201d; means, for any period, the sum of...</p>`;
    const text = stripHtmlPreserveStructure(html);
    expect(text).toContain("“Consolidated EBITDA” means");
    expect(text).not.toContain("&#x201c;");
    expect(text).not.toContain("&#x201d;");
  });

  it("lets structural definition detection see hex-encoded defined terms", () => {
    const html = `
      <html><body>
      <p>SECTION 1.01 Defined Terms.</p>
      <p>&#x201c;Consolidated EBITDA&#x201d; means Net Income plus Interest Expense.</p>
      <p>&#x201c;Indebtedness&#x201d; means, as to any Person, all indebtedness...</p>
      </body></html>
    `;
    const text = stripHtmlPreserveStructure(html);
    const structure = runStructureStage([
      { documentId: "doc-x", label: "synthetic hex-entity CA", text },
    ]);
    const defs = detectStructuralDefinitions("doc-x", text, structure.output);
    const terms = defs.map((d) => d.normalizedTerm.toLowerCase());
    expect(terms.some((t) => t.includes("consolidated ebitda"))).toBe(true);
    expect(terms.some((t) => t.includes("indebtedness"))).toBe(true);
  });

  it("maps Windows-1252 C1 curly-quote controls to Unicode quotes", () => {
    // Bytes 0x93/0x94 mis-decoded as Latin-1 become U+0093/U+0094.
    const html = `<p>\u0093Consolidated EBITDA\u0094 means, with respect to any Person...</p>`;
    const text = stripHtmlPreserveStructure(html);
    expect(text).toContain("“Consolidated EBITDA” means");
    expect(text).not.toMatch(/\u0093|\u0094/);
  });
});
