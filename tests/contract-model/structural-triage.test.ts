/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1) - required test
 * matrix for the deterministic triage layer
 * (`parseDocumentStructureWithTriage`/`evaluateStructuralCandidateTriage` in
 * stage-structure.ts). Covers every REAL HEADING and PROSE REFERENCE shape
 * named in the governing spec's own required matrix, and reports the rate
 * metrics it requires measuring: deterministic resolution rate, ambiguous
 * rate, and (via structural-ambiguity-resolution.test.ts) classifier
 * invocation rate / accuracy / UNCERTAIN rate.
 *
 * IMPORTANT: per the governing spec, "this case went to UNCERTAIN/AMBIGUOUS"
 * is never itself a failure - the only failure mode tested here is a
 * FABRICATED confident answer (a false CONFIDENT_HEADING for real prose, or
 * a false CONFIDENT_PROSE_REFERENCE for a real heading) or material
 * rank-stack corruption. Every REAL HEADING case below asserts "resolves to
 * CONFIDENT_HEADING OR AMBIGUOUS, never CONFIDENT_PROSE_REFERENCE"; every
 * PROSE REFERENCE case asserts "resolves to CONFIDENT_PROSE_REFERENCE OR
 * AMBIGUOUS, never CONFIDENT_HEADING".
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructureWithTriage, type AmbiguousStructuralCandidate, type StructuralCandidateDecision } from "../../lib/contract-model/compiler/stage-structure";

function triageFor(text: string, sectionRef: string, documentId = "doc"): { decision: StructuralCandidateDecision; ambiguous?: AmbiguousStructuralCandidate; inNodes: boolean } {
  const { nodes, ambiguousCandidates } = parseDocumentStructureWithTriage({ documentId, label: documentId, text });
  const inNodes = nodes.some((n) => n.sectionRef === sectionRef);
  const ambiguous = ambiguousCandidates.find((c) => c.candidateNumber === sectionRef);
  if (ambiguous) return { decision: "AMBIGUOUS", ambiguous, inNodes };
  return { decision: inNodes ? "CONFIDENT_HEADING" : "CONFIDENT_PROSE_REFERENCE", inNodes };
}

function expectNeverConfidentProseReference(text: string, sectionRef: string, documentId: string) {
  const result = triageFor(text, sectionRef, documentId);
  expect(result.decision, `"${sectionRef}" in "${documentId}" must never be triaged CONFIDENT_PROSE_REFERENCE`).not.toBe("CONFIDENT_PROSE_REFERENCE");
  return result;
}

function expectNeverConfidentHeading(text: string, sectionRef: string, documentId: string) {
  const result = triageFor(text, sectionRef, documentId);
  expect(result.decision, `"${sectionRef}" in "${documentId}" must never be triaged CONFIDENT_HEADING`).not.toBe("CONFIDENT_HEADING");
  return result;
}

// =============================================================================
// REQUIRED MATRIX - REAL HEADINGS (must resolve to accept, deterministically
// or via classifier LIKELY_HEADING - here: CONFIDENT_HEADING or AMBIGUOUS,
// never CONFIDENT_PROSE_REFERENCE)
// =============================================================================
describe("REQUIRED MATRIX - real headings never fabricate a false CONFIDENT_PROSE_REFERENCE", () => {
  it("capitalized title + capitalized body", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness except Permitted Indebtedness.\n\nSection 6.02 Liens. No Loan Party shall grant Liens.";
    expect(expectNeverConfidentProseReference(text, "6.01", "real-cap-title-cap-body").decision).toBe("CONFIDENT_HEADING");
  });

  it("title followed by digit-led body", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.03 Leverage Ratio. 4.00 to 1.00 shall be the maximum permitted ratio as of any test date.\n\nSection 6.04 Liens. Real text.";
    expect(expectNeverConfidentProseReference(text, "6.03", "real-digit-led-body").decision).toBe("CONFIDENT_HEADING");
  });

  it("title followed by quoted/defined-term body", () => {
    const text = 'ARTICLE VI COVENANTS\n\nSection 6.05 Restricted Payments. "Restricted Payment" has the meaning given in the definitions article.\n\nSection 6.06 Liens. Real text.';
    expect(expectNeverConfidentProseReference(text, "6.05", "real-quoted-body").decision).toBe("CONFIDENT_HEADING");
  });

  it("lowercase keyword", () => {
    const text = "ARTICLE VI COVENANTS\n\nsection 6.07 Indebtedness. Real covenant text follows here.\n\nSection 6.08 Liens. Real text.";
    expect(expectNeverConfidentProseReference(text, "6.07", "real-lowercase-keyword").decision).toBe("CONFIDENT_HEADING");
  });

  it("OCR collapsed spaces", () => {
    const text = "Section 7.01  Events  of  Default .   Each of the following constitutes an Event of Default.\n\nSection  7.02\tRemedies .\tUpon the occurrence of any Event of Default, the Agent may accelerate.";
    expect(expectNeverConfidentProseReference(text, "7.02", "real-ocr-collapsed-spaces").decision).toBe("CONFIDENT_HEADING");
  });

  it("one-line extracted document", () => {
    const text = "Section 1.01 Definitions. The following terms have the meanings set forth below.";
    expect(expectNeverConfidentProseReference(text, "1.01", "real-one-line-document").decision).toBe("CONFIDENT_HEADING");
  });

  it("wrapped title (real heading whose title text wraps across a physical line before its own terminal punctuation) - the deterministic seam is genuinely unresolvable, so AMBIGUOUS (never a false reject) is the correct outcome", () => {
    const text = "ARTICLE II COVENANTS\n\nSection 2.10 Termination or Reduction\nof Revolving Credit Commitments. The Borrower may terminate the Commitments upon notice.\n\nSection 2.11 Liens. Real text.";
    const result = expectNeverConfidentProseReference(text, "2.10", "real-wrapped-title");
    expect(result.decision).toBe("AMBIGUOUS");
    expect(result.ambiguous?.triage.signals.seamValidation).toBe("INCOMPLETE_NO_TERMINAL");
  });

  it("page number", () => {
    const text = "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness except Permitted Indebtedness\n42\nSection 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.";
    expect(expectNeverConfidentProseReference(text, "6.02", "real-page-number").decision).toBe("CONFIDENT_HEADING");
  });

  it("footnote", () => {
    const text = 'Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as permitted under the definition of "Permitted Tax Distribution")9\n\nSection 6.09 Limitation on Restricted Payments. Notwithstanding the foregoing, no Restricted Payment shall be made if a Default has occurred.';
    expect(expectNeverConfidentProseReference(text, "6.09", "real-footnote").decision).toBe("CONFIDENT_HEADING");
  });

  it("ARTICLE immediately followed by SECTION", () => {
    const text = "ARTICLE VI COVENANTS\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\n(a) x.";
    const article = triageFor(text, "VI", "real-article-then-section");
    expect(article.decision).toBe("CONFIDENT_HEADING");
    expect(expectNeverConfidentProseReference(text, "6.01", "real-article-then-section").decision).toBe("CONFIDENT_HEADING");
  });

  it("integer amendment section", () => {
    const text = "SECTION 1. Amendments. The Credit Agreement is hereby amended as set forth below.\n\nSECTION 2. Increased Facility Activation Notice. The Borrower may activate the increased facility by notice.";
    expect(expectNeverConfidentProseReference(text, "1", "real-integer-amendment").decision).toBe("CONFIDENT_HEADING");
  });

  it("bare integer section", () => {
    const text = "1. Amendment. The Credit Agreement is hereby amended as set forth below.\n\n2. Conditions. This Amendment shall become effective upon satisfaction of the following conditions.";
    expect(expectNeverConfidentProseReference(text, "1", "real-bare-integer").decision).toBe("CONFIDENT_HEADING");
  });

  it("definitions-style 'Term. means ...' where genuinely structural", () => {
    const text =
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.07 Applicable Rate. Real prior definition body text ends here properly.\n\n" +
      "Section 1.08 Applicable Margin. means, with respect to any Loan, the percentage per annum set forth in the Pricing Grid attached as Schedule 1 to this Agreement.\n\n" +
      "Section 1.09 Business Day. Real next definition body text.";
    const result = expectNeverConfidentProseReference(text, "1.08", "real-definitions-means-style");
    // A genuine paragraph break precedes this candidate, so the triage
    // procedure resolves it CONFIDENT_HEADING deterministically - fixing,
    // via the new architecture, the exact false negative the auditor's own
    // falsifying reproduction (Part 4) demonstrated against the OLD
    // lowercase-veto design. See part-b-final-fix1-independent-recert.test.ts
    // (updated in place) for the full before/after record.
    expect(result.decision).toBe("CONFIDENT_HEADING");
  });

  it("definitions-style 'Term. means ...' with weak preceding evidence (no paragraph break) - genuinely ambiguous, correctly routed to the classifier rather than guessed", () => {
    const text = "Section 1.07 Applicable Rate. Real prior text.\nSection 1.08 Applicable Margin. means, with respect to any Loan, the percentage set forth in the Pricing Grid.";
    const result = expectNeverConfidentProseReference(text, "1.08", "real-definitions-means-weak-evidence");
    expect(result.decision).toBe("AMBIGUOUS");
  });
});

// =============================================================================
// REQUIRED MATRIX - PROSE REFERENCES (must resolve to reject, deterministically
// or via classifier LIKELY_PROSE_REFERENCE, or safely AMBIGUOUS - never a
// false CONFIDENT_HEADING accept)
// =============================================================================
describe("REQUIRED MATRIX - prose references never fabricate a false CONFIDENT_HEADING", () => {
  it("complete citation sentence followed by a capitalized sentence", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const result = expectNeverConfidentHeading(text, "6.09", "prose-capitalized-continuation");
    expect(result.decision).toBe("AMBIGUOUS"); // the auditor's own proven-irresolvable shape
  });

  it("citation followed by a quote-led sentence", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      'Section 6.09 Limitation on Restricted Payments. "Indebtedness" shall have the meaning given to it elsewhere in this instrument for purposes of this cross-reference only.\n' +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    expectNeverConfidentHeading(text, "6.09", "prose-quote-led-continuation");
  });

  it("citation followed by an acronym-led sentence", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      "Section 6.09 Limitation on Restricted Payments. GAAP principles shall govern the calculation of any amount referenced in this cross-reference for accounting purposes.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    expectNeverConfidentHeading(text, "6.09", "prose-acronym-led-continuation");
  });

  it("citation followed by a number-led sentence", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The obligations remain subject to normal terms.\n" +
      "Section 6.09 Limitation on Restricted Payments. 50% of any Excess Cash Flow shall be applied as described elsewhere in this instrument for illustrative purposes only.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    expectNeverConfidentHeading(text, "6.09", "prose-number-led-continuation");
  });

  it("numerically-next citation (table-row/bullet-list shape)", () => {
    const text = "Section 5.01 Financial Covenants. Leverage Ratio shall not exceed 4.00 to 1.00\nSection 5.02 Reporting. Deliver quarterly financial statements.\n\n(a) Within 45 days.";
    expectNeverConfidentHeading(text, "5.02", "prose-numerically-next");
  });

  it("wrapped citation", () => {
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n" +
      "Section 3.09 Limitation on\n" +
      "Restricted Payments. is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n" +
      "(a) Real clause that belongs to 3.08.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const result = expectNeverConfidentHeading(text, "3.09", "prose-wrapped-citation");
    expect(result.decision).toBe("AMBIGUOUS");
  });

  it("unrelated footnote + citation", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      'Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as permitted under the definition of "Permitted Tax Distribution")9\n' +
      "Section 6.09 Limitation on Restricted Payments. is only an illustrative cross-reference embedded in the same paragraph of ordinary body prose and creates no real section break here at all.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    expectNeverConfidentHeading(text, "6.09", "prose-unrelated-footnote-plus-citation");
  });

  it("unrelated page artifact + citation", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment as further described without a real sentence end here\n47\n" +
      "Section 6.09 Limitation on Restricted Payments. is only an illustrative cross-reference within the same paragraph and does not create a new section here.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    expectNeverConfidentHeading(text, "6.09", "prose-unrelated-page-artifact-plus-citation");
  });

  it("table/list/schedule collapse", () => {
    const text = "Section 6.01 Indebtedness. No Loan\nSection 6.02 Liens. No Loan Party\nParty shall incur Indebtedness except\nshall grant Liens except Permitted\nPermitted Indebtedness.\nLiens.\n\n(a) x.\n\n(a) y.";
    expectNeverConfidentHeading(text, "6.02", "prose-table-schedule-collapse");
  });

  it("two unrelated short lines made heading-shaped by extraction", () => {
    const text =
      "ARTICLE IX MISCELLANEOUS\n\n" +
      "Section 9.04 Assignment. Real prior body text ends here properly.\n\n" +
      "Section 9.05 Waiver of\n" +
      "Notices required under this arrangement shall be delivered in writing to the addresses set forth in Schedule 1 hereto and shall be effective upon actual receipt by the intended recipient.\n\n" +
      "Section 9.06 Governing Law. Real next body text.";
    expectNeverConfidentHeading(text, "9.05", "prose-two-unrelated-lines");
  });

  it("real next heading shortly after a fake citation", () => {
    const text =
      "ARTICLE III REPRESENTATIONS\n\n" +
      "Section 3.08 Litigation. Real prior body text ends properly.\n\n" +
      "Section 3.09 Limitation on Restricted Payments is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n\n" +
      "Section 3.10 Compliance. Real next body text.";
    const result = expectNeverConfidentHeading(text, "3.09", "prose-real-heading-shortly-after-fake-citation");
    // This is the falsifying test's own Part 3 final case: the OLD
    // unbounded-keyword-lookahead check laundered 3.09 through purely
    // because a REAL heading eventually appeared, regardless of how much
    // real prose separated them. The new bounded IMMEDIATE_KEYWORD check
    // (<=2 whitespace chars) correctly refuses to treat a keyword found only
    // after a full paragraph break as adjacency evidence.
    expect(result.decision).not.toBe("CONFIDENT_HEADING");
    // 3.10 itself must still be reachable and correctly parented - no
    // material rank-stack corruption from this candidate's own presence in
    // the ambiguous/rejected set.
    const { nodes } = parseDocumentStructureWithTriage({ documentId: "prose-real-heading-shortly-after-fake-citation", label: "d", text });
    expect(nodes.some((n) => n.sectionRef === "3.10")).toBe(true);
  });
});

// =============================================================================
// COMPOSITION - zero material rank-stack corruption: a candidate excluded
// (CONFIDENT_PROSE_REFERENCE or fail-closed-excluded AMBIGUOUS) must never
// re-parent real content away from its true enclosing section.
// =============================================================================
describe("COMPOSITION - zero material rank-stack corruption under the triage-driven path", () => {
  it("an AMBIGUOUS (fail-closed excluded) candidate never re-parents a real child clause away from its true enclosing section", () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n" +
      "(b) Indebtedness existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const { nodes, ambiguousCandidates } = parseDocumentStructureWithTriage({ documentId: "composition-triage-fail-closed", label: "d", text });
    expect(ambiguousCandidates.some((c) => c.candidateNumber === "6.09")).toBe(true);
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(false); // fail-closed: never fabricated as a structural boundary
    const a = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    const b = nodes.find((n) => n.sectionRef.endsWith("(b)"));
    expect(a?.parentSectionRef).toBe("6.08");
    expect(b?.parentSectionRef).toBe("6.08");
  });

  it("a CONFIDENT_HEADING candidate is never silently demoted, losing its own children", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. Neither party shall incur Indebtedness except: (a) ordinary trade payables; (b) purchase money debt.";
    const { nodes } = parseDocumentStructureWithTriage({ documentId: "composition-confident-heading-keeps-children", label: "d", text });
    const s601 = nodes.find((n) => n.sectionRef === "6.01");
    expect(s601).toBeDefined();
    expect(nodes.find((n) => n.sectionRef === "6.01(a)")?.parentSectionRef).toBe("6.01");
    expect(nodes.find((n) => n.sectionRef === "6.01(b)")?.parentSectionRef).toBe("6.01");
  });
});

// =============================================================================
// RATE METRICS - deterministic resolution rate / ambiguous rate over a
// realistic mixed document (mostly clear-cut headings, one genuinely
// ambiguous citation) - the governing spec's own "a normal contract should
// resolve the overwhelming majority of structure deterministically, with
// zero or near-zero classifier calls" requirement.
// =============================================================================
describe("RATE METRICS - deterministic resolution rate on a realistic mixed document", () => {
  it("a normal, mostly-clear-cut document resolves almost entirely deterministically", () => {
    const text = [
      "ARTICLE VI COVENANTS",
      "",
      "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness except Permitted Indebtedness.",
      "",
      "Section 6.02 Liens. No Loan Party shall grant Liens except Permitted Liens.",
      "",
      "Section 6.03 Restricted Payments. No Loan Party shall make Restricted Payments except as permitted.",
      "",
      "Section 6.04 Investments. No Loan Party shall make Investments except Permitted Investments.",
      // one genuinely ambiguous, well-punctuated in-prose citation immediately
      // following real body text with only a single newline (sentence-
      // terminal punctuation, no paragraph break) between them - the
      // auditor's own proven-irresolvable shape, deliberately included so
      // this document exercises a real (if rare) AMBIGUOUS routing.
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described elsewhere in this instrument.",
      "",
      "Section 6.05 Fundamental Changes. No Loan Party shall merge or consolidate except as permitted.",
    ].join("\n");
    const { triageStats } = parseDocumentStructureWithTriage({ documentId: "rate-metrics-mixed-document", label: "d", text });
    expect(triageStats.totalCandidates).toBeGreaterThan(0);
    expect(triageStats.ambiguousCount).toBeGreaterThanOrEqual(1);
    const deterministicResolutionRate = (triageStats.totalCandidates - triageStats.ambiguousCount) / triageStats.totalCandidates;
    expect(deterministicResolutionRate).toBeGreaterThanOrEqual(0.7); // overwhelming majority resolved with zero classifier calls
  });
});
