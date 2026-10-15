/**
 * Reviewer §11.21-§11.24 (DEV fixture Gibraltar, ehb:8b895fb6): the real extracted text of the end of Article XI
 * through the start of the signature pages. The run-in headings wrap ("Interest Rate\nLimitation .") and must parse
 * as siblings; the last section must stop at the execution block, not run to the end of the document (it spanned
 * 57k chars of signature pages and exhibits before the fix).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSectionTree } from "@/lib/contract-model/section-tree/parse";

const TEXT = `ARTICLE XI\n\nMISCELLANEOUS\n\n${readFileSync("tests/fixtures/section-tree-1121-1124-gibraltar.txt", "utf8")}`;

describe("§11.21-§11.24 on the real text", () => {
  const t = parseSectionTree(TEXT);
  it("parses 11.21-11.24 as sibling sections", () => {
    expect(t.nodes.filter((n) => n.kind === "SECTION").map((n) => n.path)).toEqual(["11.21", "11.22", "11.23", "11.24"]);
    const s21 = t.nodes.find((n) => n.path === "11.21")!;
    expect(TEXT.slice(s21.start, s21.end)).not.toMatch(/Independence/);
  });
  it("§11.24 ends before the execution block", () => {
    const s24 = t.nodes.find((n) => n.path === "11.24")!;
    expect(TEXT.slice(s24.start, s24.end)).toMatch(/USA Patriot Act\.?\s*$|Patriot Act\.\s*$/);
    expect(TEXT.slice(s24.start, s24.end)).not.toMatch(/WITNESS|Remainder/);
  });
});
