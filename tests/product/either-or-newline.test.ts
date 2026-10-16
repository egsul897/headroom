/**
 * Rule 41 — either/or alternative-reading detection must span
 * newlines (same defect class as rule 39).
 *
 * buildAlternativesAndAssumptions used /\beither\b.+\bor\b/ —
 * "." cannot cross a newline. A multi-line "either (x) ...
 * \nor (y) ..." provision got no alternative-paths note, so
 * counsel was not told the provision offers alternative paths.
 * [\s\S] spans newlines.
 */
import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function analyze(excerpt: string) {
  const candidate = {
    candidateId: "c1",
    sourceId: "doc-1",
    families: ["DEBT_INCURRENCE"],
    signals: [],
    excerpt,
    representationLevel: "SOURCE_BACKED",
    discoveryScore: 0.9,
  } as unknown as CovenantCandidateRecord;
  return analyzeProvision({
    sourceId: "doc-1",
    documentTitle: "Credit Agreement",
    candidate,
    definitions: [],
    structuralNodes: [],
  });
}

describe("either/or alternative reading across newlines", () => {
  it("multi-line either/or yields the alternative-paths note", () => {
    const a = analyze(
      "The Borrower may elect either (x) to prepay the Loans in full\nor (y) to apply the proceeds to reduce the Revolving Commitments.",
    );
    expect(a.alternativeInterpretations?.some((t) => /alternative paths/i.test(t))).toBe(true);
  });

  it("single-line either/or still yields the note", () => {
    const a = analyze(
      "The Borrower may elect either (x) to prepay the Loans in full or (y) to apply the proceeds to reduce the Revolving Commitments.",
    );
    expect(a.alternativeInterpretations?.some((t) => /alternative paths/i.test(t))).toBe(true);
  });
});
