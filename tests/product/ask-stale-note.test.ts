/**
 * Rule 55 — Ask must disclose when it relied on stale analyses.
 *
 * Rules 5/46 put the stale marker on the document page and in
 * the monitoring feed, but Ask — where a CFO asks "can we do
 * this transaction?" — answered from stale summaries with no
 * disclosure. A stale summary may contain pre-fix
 * interpretations (e.g. pre-#391 TOC duplicates, invented
 * permissions). The answer now carries a stale-analysis
 * limitation naming the stale documents.
 */
import { describe, expect, it } from "vitest";
import { staleAnalysisNote, typeMismatchNote } from "../../lib/product/covenant-intelligence/ask-stale-note";

describe("staleAnalysisNote", () => {
  it("returns null when nothing is stale", () => {
    expect(staleAnalysisNote([])).toBeNull();
  });

  it("names stale documents", () => {
    const note = staleAnalysisNote(["Indenture.pdf"]);
    expect(note).toContain("1 document(s)");
    expect(note).toContain("Indenture.pdf");
    expect(note).toContain("re-analyze");
  });

  it("caps titles at 3 with a remainder count", () => {
    const note = staleAnalysisNote(["A", "B", "C", "D", "E"]);
    expect(note).toContain("5 document(s)");
    expect(note).toContain("A, B, C");
    expect(note).toContain("and 2 more");
    expect(note).not.toContain("D, E");
  });
});

/**
 * Rule 124 — Ask must disclose type mismatch in documents it
 * relied on. Same shape as the rule-55 staleness disclosure:
 * null when nothing mismatches, names the documents, caps
 * titles at 3 with a remainder count.
 */
describe("typeMismatchNote", () => {
  it("returns null when nothing mismatches", () => {
    expect(typeMismatchNote([])).toBeNull();
  });

  it("names mismatched documents with both values", () => {
    const note = typeMismatchNote(["Indenture.pdf (declared INDENTURE, analyzed as CREDIT_AGREEMENT)"]);
    expect(note).toContain("1 document(s)");
    expect(note).toContain("declared INDENTURE");
    expect(note).toContain("analyzed as CREDIT_AGREEMENT");
    expect(note).toContain("operative resolution");
  });

  it("caps titles at 3 with a remainder count", () => {
    const note = typeMismatchNote(["A", "B", "C", "D"]);
    expect(note).toContain("4 document(s)");
    expect(note).toContain("A; B; C");
    expect(note).toContain("and 1 more");
    expect(note).not.toContain("D");
  });
});
