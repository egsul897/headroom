/**
 * Rule 39 — "Neither ... shall" posture detection must span
 * newlines.
 *
 * detectPosture used /\bneither\b.{0,120}\bshall\b/ — "." cannot
 * cross a newline. PDF-extracted excerpts break lines mid-sentence,
 * so "Neither the Borrower nor any of its Restricted
 * Subsidiaries\nshall create ..." failed the Neither check and
 * fell through to OBLIGATION. A prohibition ("Neither X nor Y
 * shall create") was presented as an obligation — a meaning
 * inversion. [\s\S] spans newlines.
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

describe("Neither ... shall posture across newlines", () => {
  it("multi-line Neither prohibition is GENERAL_PROHIBITION", () => {
    const a = analyze(
      "Neither the Borrower nor any of its Restricted Subsidiaries\nshall create, incur or assume any Indebtedness except as permitted herein.",
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });

  it("single-line Neither prohibition stays GENERAL_PROHIBITION", () => {
    const a = analyze(
      "Neither the Borrower nor any of its Restricted Subsidiaries shall create, incur or assume any Indebtedness except as permitted herein.",
    );
    expect(a.posture).toBe("GENERAL_PROHIBITION");
  });
});
