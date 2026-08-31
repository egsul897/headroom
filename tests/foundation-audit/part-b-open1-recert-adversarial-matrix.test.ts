/**
 * INDEPENDENT PART B RECERTIFICATION AUDIT (OPEN-1, structural heading
 * triage/classifier) - conceptually pinned to production commit
 * a7ee654f4eec1614ef59d47c5f07c597264edc5a. This file is written FRESH by
 * this auditor: every fixture below uses subject matter, section numbers,
 * and wording never used in the implementers' own deliverable tests
 * (tests/contract-model/structural-triage.test.ts,
 * tests/certification/part-b-final-fix1-independent-recert.test.ts,
 * tests/certification/part-a-final-fix1-structural.test.ts,
 * tests/foundation-audit/structural-ambiguity-*-orchestrator-wiring.test.ts).
 * Those files' own real 6.08/6.09/6.10 Restricted-Payments fixture is never
 * reused here - this matrix instead exercises Investments (Article
 * VII/5.0x), Reporting (Article VIII/IX/9.0x), Asset Dispositions (4.1x),
 * Restricted Subsidiaries (7.01), and amendment-style integer sections, so a
 * defect that happens to be masked by the implementers' own specific wording
 * cannot hide behind it here.
 *
 * Per the governing spec and this audit's own charter: "this case went to
 * AMBIGUOUS/UNCERTAIN/review" is NEVER a failure - it is the designed-safe
 * outcome. The ONLY failure mode this file hunts for is a CONFIDENTLY WRONG
 * answer (a false CONFIDENT_HEADING for real prose, a false
 * CONFIDENT_PROSE_REFERENCE for a real heading) or material rank-stack
 * corruption (a false heading re-parenting real content, or a true heading
 * silently losing its own children).
 *
 * Every fixture below was independently probed against the real, unmodified
 * `parseDocumentStructureWithTriage`/`resolveStructuralAmbiguity` before
 * being committed to assertions here - this is not a "write assertions and
 * hope" test file.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { parseDocumentStructureWithTriage, type AmbiguousStructuralCandidate, type StructuralCandidateDecision } from "../../lib/contract-model/compiler/stage-structure";
import { resolveStructuralAmbiguity, computeStructuralAmbiguityResolutionRateMetrics, runStructureStageWithAmbiguityResolution } from "../../lib/contract-model/compiler/structural-ambiguity-resolution";
import { InMemoryStructuralAmbiguityCache } from "../../lib/contract-model/compiler/structural-ambiguity-classifier";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

function triageFor(text: string, sectionRef: string, documentId: string): { decision: StructuralCandidateDecision; ambiguous?: AmbiguousStructuralCandidate; nodes: ReturnType<typeof parseDocumentStructureWithTriage>["nodes"] } {
  const { nodes, ambiguousCandidates } = parseDocumentStructureWithTriage({ documentId, label: documentId, text });
  const inNodes = nodes.some((n) => n.sectionRef === sectionRef);
  const ambiguous = ambiguousCandidates.find((c) => c.candidateNumber === sectionRef);
  if (ambiguous) return { decision: "AMBIGUOUS", ambiguous, nodes };
  return { decision: inNodes ? "CONFIDENT_HEADING" : "CONFIDENT_PROSE_REFERENCE", nodes };
}

function neverFalseProseReference(text: string, sectionRef: string, documentId: string) {
  const result = triageFor(text, sectionRef, documentId);
  expect(result.decision, `AUDITOR CASE FAILED: "${sectionRef}" in "${documentId}" (a genuine heading) was confidently rejected as prose`).not.toBe("CONFIDENT_PROSE_REFERENCE");
  return result;
}

function neverFalseHeading(text: string, sectionRef: string, documentId: string) {
  const result = triageFor(text, sectionRef, documentId);
  expect(result.decision, `AUDITOR CASE FAILED: "${sectionRef}" in "${documentId}" (ordinary prose) was confidently accepted as a heading`).not.toBe("CONFIDENT_HEADING");
  return result;
}

// =============================================================================
// PART 1 - FRESH TRUE-HEADING COUNTERPARTS (must never be confidently
// rejected as prose)
// =============================================================================
describe("AUDITOR MATRIX (fresh) - true headings never confidently rejected", () => {
  it("1. capitalized title + capitalized body", () => {
    const text = "ARTICLE V INVESTMENTS\n\nSection 5.01 Permitted Investments. The Borrower may make Investments in Cash Equivalents without restriction.\n\nSection 5.02 Restricted Investments. Real text follows here properly.";
    expect(neverFalseProseReference(text, "5.01", "aud-t1").decision).toBe("CONFIDENT_HEADING");
  });

  it("2. title followed by digit-led body", () => {
    const text = "ARTICLE V INVESTMENTS\n\nSection 5.02 Restricted Investments. 65% of Consolidated Net Tangible Assets may be invested in Non-Guarantor Restricted Subsidiaries.\n\nSection 5.03 Real text follows here.";
    expect(neverFalseProseReference(text, "5.02", "aud-t2").decision).toBe("CONFIDENT_HEADING");
  });

  it("3. title followed by quoted/defined-term body", () => {
    const text = 'ARTICLE V INVESTMENTS\n\nSection 5.03 Investments in Joint Ventures. "Joint Venture Investment" shall have the meaning ascribed to it in Article I.\n\nSection 5.04 Real text follows here.';
    expect(neverFalseProseReference(text, "5.03", "aud-t3").decision).toBe("CONFIDENT_HEADING");
  });

  it("4. lowercase keyword", () => {
    const text = "ARTICLE IX REPORTING\n\nsection 9.01 Financial Statements. The Borrower shall deliver annual audited financial statements to the Administrative Agent.\n\nSection 9.02 Real text follows here.";
    expect(neverFalseProseReference(text, "9.01", "aud-t4").decision).toBe("CONFIDENT_HEADING");
  });

  it("5. OCR collapsed/doubled spaces and tabs", () => {
    const text = "Section 9.01  Financial  Statements .   Deliver annual audited financial statements.\n\nSection  9.02\tCompliance   Certificates .\tDeliver a compliance certificate with each statement.";
    expect(neverFalseProseReference(text, "9.02", "aud-t5").decision).toBe("CONFIDENT_HEADING");
  });

  it("6. wrapped title - genuinely unresolvable seam, AMBIGUOUS is the correct (safe) outcome, never a false reject", () => {
    const text = "ARTICLE IV ASSET DISPOSITIONS\n\nSection 4.11 Asset Sales and Other Dispositions\nof Property. The Borrower shall not consummate any Asset Sale except as permitted hereunder.\n\nSection 4.12 Real text follows here.";
    const result = neverFalseProseReference(text, "4.11", "aud-t6");
    expect(result.decision).toBe("AMBIGUOUS");
    expect(result.ambiguous?.triage.signals.seamValidation).toBe("INCOMPLETE_NO_TERMINAL");
  });

  it("7. page-number artifact (blank-line-bounded) adjacent to the real heading", () => {
    const text = "Section 6.21 Subordinated Indebtedness. No Loan Party shall incur Subordinated Indebtedness except as permitted\n\n55\n\nSection 6.22 Permitted Refinancing. The Borrower may refinance Indebtedness subject to customary conditions.";
    expect(neverFalseProseReference(text, "6.22", "aud-t7").decision).toBe("CONFIDENT_HEADING");
  });

  it("8. footnote marker glued to a CLOSING PARENTHESIS (not merely a period) immediately before the real heading - exercises the Part-A generalized footnote-noise class", () => {
    const text = 'Section 7.04 Compliance with Laws. The Borrower shall comply with all applicable Requirements of Law (as defined in the definition of "Requirements of Law")14\n\nSection 7.05 Insurance. The Borrower shall maintain insurance coverage in commercially reasonable amounts.';
    expect(neverFalseProseReference(text, "7.05", "aud-t8").decision).toBe("CONFIDENT_HEADING");
  });

  it("9. ARTICLE immediately followed by SECTION (no terminating punctuation, single newline)", () => {
    const text = "ARTICLE VII RESTRICTED SUBSIDIARIES\nSection 7.01 Designation of Restricted Subsidiaries. The Borrower may designate any Subsidiary as a Restricted Subsidiary.\n\n(a) Real clause under 7.01.";
    expect(triageFor(text, "VII", "aud-t9").decision).toBe("CONFIDENT_HEADING");
    expect(neverFalseProseReference(text, "7.01", "aud-t9").decision).toBe("CONFIDENT_HEADING");
  });

  it("10. integer amendment-style section (no decimal sub-number)", () => {
    const text = "SECTION 1. Waiver of Financial Covenant Testing. The Required Lenders hereby waive testing of the Leverage Ratio for the applicable Test Period.\n\nSECTION 2. Extension of Maturity Date. The Maturity Date is hereby extended to the date set forth on Schedule A.";
    expect(neverFalseProseReference(text, "1", "aud-t10").decision).toBe("CONFIDENT_HEADING");
  });

  it("11. bare integer section (no keyword at all)", () => {
    const text = "1. Extension. The Termination Date is hereby extended by twelve months.\n\n2. Fee. The Borrower shall pay an extension fee equal to 0.25% of the Commitments.";
    expect(neverFalseProseReference(text, "1", "aud-t11").decision).toBe("CONFIDENT_HEADING");
  });

  it("12. genuinely-structural 'Term. means ...' definitions style, strong (paragraph-break) evidence -> resolved deterministically, zero classifier calls needed", () => {
    const text =
      "ARTICLE I DEFINITIONS\n\n" +
      "Section 1.14 Applicable Premium. Real prior definition body text ends here properly.\n\n" +
      "Section 1.15 Available Amount. means, as of any date of determination, the sum of (a) Retained Excess Cash Flow and (b) Cumulative Credit.\n\n" +
      "Section 1.16 Business Day. Real next definition body text.";
    expect(neverFalseProseReference(text, "1.15", "aud-t12").decision).toBe("CONFIDENT_HEADING");
  });

  it("13. an ordinary confident document costs ZERO ambiguous candidates and ZERO classifier calls (cost-discipline sanity check, distinct fresh fixture)", () => {
    const text =
      "ARTICLE VI NEGATIVE COVENANTS\n\n" +
      "Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness.\n\n" +
      "Section 6.02 Liens. The Borrower will not create any Lien.\n\n" +
      "Section 6.03 Investments. The Borrower will not make Investments.\n\n" +
      "Section 6.04 Asset Sales. The Borrower will not sell assets outside the ordinary course.\n\n" +
      "Section 6.05 Restricted Payments. The Borrower will not make Restricted Payments.\n\n" +
      "Section 6.06 Transactions with Affiliates. The Borrower will not enter into Affiliate transactions.\n";
    const { triageStats } = parseDocumentStructureWithTriage({ documentId: "aud-t13", label: "d", text });
    expect(triageStats.ambiguousCount).toBe(0);
    expect(triageStats.confidentHeadingCount).toBe(triageStats.totalCandidates);
    expect((triageStats.totalCandidates - triageStats.ambiguousCount) / triageStats.totalCandidates).toBe(1);
  });
});

// =============================================================================
// PART 2 - FRESH PROSE-REFERENCE COUNTERPARTS (must never be confidently
// accepted as a heading)
// =============================================================================
describe("AUDITOR MATRIX (fresh) - prose references never confidently accepted", () => {
  it("1. complete citation sentence followed by a capitalized sentence", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    const result = neverFalseHeading(text, "7.09", "aud-p1");
    expect(result.decision).toBe("AMBIGUOUS"); // the proven-irresolvable-by-typography shape - safe, not a failure
  });

  it("2. citation followed by a quote-led sentence", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The obligations remain subject to normal terms.\n" +
      'Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. "Unrestricted Subsidiary" has the meaning assigned elsewhere in this instrument for purposes of this cross-reference only.\n' +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    neverFalseHeading(text, "7.09", "aud-p2");
  });

  it("3. citation followed by an acronym-led sentence", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The obligations remain subject to normal terms.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. EBITDA calculations shall govern the measurement of any amount referenced in this cross-reference for financial reporting purposes.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    neverFalseHeading(text, "7.09", "aud-p3");
  });

  it("4. citation followed by a number-led sentence", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The obligations remain subject to normal terms.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. 35% of any Excess Cash Flow shall be applied as described elsewhere in this instrument for illustrative purposes only.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    neverFalseHeading(text, "7.09", "aud-p4");
  });

  it("5. numerically-next citation (table-row/bullet-list collapse shape)", () => {
    const text = "Section 8.01 Reporting Covenants. Annual audited financials due within 120 days\nSection 8.02 Notices. Deliver notice of Default promptly.\n\n(a) Within 3 Business Days.";
    const result = neverFalseHeading(text, "8.02", "aud-p5");
    expect(result.decision).toBe("CONFIDENT_PROSE_REFERENCE"); // deterministically rejected, no classifier call needed
  });

  it("6. wrapped citation (fake title wraps across a line, no real seam)", () => {
    const text =
      "ARTICLE VIII REPORTING\n\n" +
      "Section 8.05 Notices of Material Events. Real prior body text ends properly.\n" +
      "Section 8.06 Limitation on\n" +
      "Additional Indebtedness. is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n" +
      "(a) Real clause that belongs to 8.05.\n\n" +
      "Section 8.07 Use of Proceeds. Real next body text.";
    const result = neverFalseHeading(text, "8.06", "aud-p6");
    expect(result.decision).toBe("AMBIGUOUS");
  });

  it("7. unrelated footnote + citation (single-newline separation, footnote has no causal relationship to the citation)", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      'Section 7.08 Limitation on Investments. The Borrower shall not make Investments except as permitted under the definition of "Permitted Basket Investment")11\n' +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. is only an illustrative cross-reference embedded in the same paragraph of ordinary body prose and creates no real section break here at all.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    const result = neverFalseHeading(text, "7.09", "aud-p7");
    expect(result.decision).toBe("CONFIDENT_PROSE_REFERENCE");
  });

  it("8. unrelated page artifact + citation (single-newline separation)", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except as further described without a real sentence end here\n63\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. is only an illustrative cross-reference within the same paragraph and does not create a new section here.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    const result = neverFalseHeading(text, "7.09", "aud-p8");
    expect(result.decision).toBe("CONFIDENT_PROSE_REFERENCE");
  });

  it("9. table/list/schedule collapse (a two-column table extracted as interleaved lines)", () => {
    const text = "Section 8.01 Reporting. Deliver Annual\nSection 8.02 Notices. Deliver prompt\nFinancials within 120 days except\nnotice of Default except as otherwise\nas otherwise agreed.\nagreed.\n\n(a) x.\n\n(a) y.";
    const result = neverFalseHeading(text, "8.02", "aud-p9");
    expect(result.decision).toBe("CONFIDENT_PROSE_REFERENCE");
  });

  it("10. two unrelated short lines made heading-shaped by extraction", () => {
    const text =
      "ARTICLE VIII REPORTING\n\n" +
      "Section 8.09 Books and Records. Real prior body text ends here properly.\n\n" +
      "Section 8.10 Delivery of\n" +
      "Notices required under this arrangement shall be delivered in writing to the addresses set forth in Schedule 2 hereto and shall be effective upon actual receipt by the intended recipient.\n\n" +
      "Section 8.11 Inspection Rights. Real next body text.";
    const result = neverFalseHeading(text, "8.10", "aud-p10");
    expect(result.decision).toBe("AMBIGUOUS");
  });

  it("11. real next heading shortly after a fake citation - the fake citation is never confidently accepted, AND the real subsequent heading is unaffected (proves the bounded-adjacency fix, fresh construction)", () => {
    const text =
      "ARTICLE VIII REPORTING\n\n" +
      "Section 8.05 Notices of Material Events. Real prior body text ends properly.\n\n" +
      "Section 8.06 Limitation on Additional Indebtedness is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n\n" +
      "Section 8.07 Use of Proceeds. Real next body text.";
    const result = neverFalseHeading(text, "8.06", "aud-p11");
    expect(result.decision).not.toBe("CONFIDENT_HEADING");
    expect(result.nodes.some((n) => n.sectionRef === "8.07")).toBe(true);
  });
});

// =============================================================================
// PART 3 - COMPOSITION: zero material rank-stack corruption, fresh
// constructions in both directions (false-heading-would-re-parent, and
// true-heading-must-not-lose-children)
// =============================================================================
describe("AUDITOR MATRIX (fresh) - zero material rank-stack corruption", () => {
  it("a fail-closed-excluded AMBIGUOUS candidate never re-parents its neighbor's real clause away from the true enclosing section", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    const { nodes } = parseDocumentStructureWithTriage({ documentId: "aud-c1", label: "d", text });
    expect(nodes.some((n) => n.sectionRef === "7.09")).toBe(false); // fail-closed excluded by default (no classifier consulted yet)
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("7.08"); // never re-parented to the excluded 7.09
    expect(nodes.some((n) => n.sectionRef === "7.10")).toBe(true); // the following real heading is unaffected
  });

  it("a wrapped-citation AMBIGUOUS candidate never re-parents the real clause belonging to its true preceding section", () => {
    const text =
      "ARTICLE VIII REPORTING\n\n" +
      "Section 8.05 Notices of Material Events. Real prior body text ends properly.\n" +
      "Section 8.06 Limitation on\n" +
      "Additional Indebtedness. is only a cross-reference embedded in ordinary prose describing another part of this instrument and creates no boundary here at all.\n" +
      "(a) Real clause that belongs to 8.05.\n\n" +
      "Section 8.07 Use of Proceeds. Real next body text.";
    const { nodes } = parseDocumentStructureWithTriage({ documentId: "aud-c2", label: "d", text });
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("8.05");
    expect(nodes.some((n) => n.sectionRef === "8.07")).toBe(true);
  });

  it("a genuinely CONFIDENT_HEADING is never silently demoted or stripped of its own children (fresh multi-clause construction)", () => {
    const text =
      "ARTICLE VII RESTRICTED SUBSIDIARIES\n\n" +
      "Section 7.01 Designation of Restricted Subsidiaries. The Borrower may designate any Subsidiary as a Restricted Subsidiary if the following conditions are met:\n" +
      "(a) no Default has occurred and is continuing;\n" +
      "(b) the Designation Amount does not exceed the Available Amount; and\n" +
      "(c) the Board of Directors has approved such designation.\n\n" +
      "Section 7.02 Redesignation. The Borrower may redesignate a Restricted Subsidiary as an Unrestricted Subsidiary.";
    const { nodes } = parseDocumentStructureWithTriage({ documentId: "aud-c3", label: "d", text });
    expect(nodes.some((n) => n.sectionRef === "7.01")).toBe(true);
    const clauses = ["7.01(a)", "7.01(b)", "7.01(c)"];
    for (const ref of clauses) {
      const node = nodes.find((n) => n.sectionRef === ref);
      expect(node, `expected clause ${ref} to survive under its true parent`).toBeDefined();
      expect(node!.parentSectionRef).toBe("7.01");
    }
    expect(nodes.some((n) => n.sectionRef === "7.02")).toBe(true);
  });

  it("two AMBIGUOUS candidates fail-closed excluded in the same document never merge or corrupt each other's neighboring real sections", () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.\n" +
      "Section 7.11 Limitation on Sale-Leasebacks. This restriction cross-references the Asset Sale covenant described elsewhere in this Agreement.\n" +
      "(a) Real clause under 7.10.\n\n" +
      "Section 7.12 Limitation on Hedging. The Borrower shall not enter into speculative Hedging Agreements.";
    const { nodes, ambiguousCandidates } = parseDocumentStructureWithTriage({ documentId: "aud-c4", label: "d", text });
    expect(ambiguousCandidates.map((c) => c.candidateNumber).sort()).toEqual(["7.09", "7.11"]);
    expect(nodes.some((n) => n.sectionRef === "7.09")).toBe(false);
    expect(nodes.some((n) => n.sectionRef === "7.11")).toBe(false);
    expect(nodes.find((n) => n.sectionRef === "7.08(a)")?.parentSectionRef).toBe("7.08");
    expect(nodes.find((n) => n.sectionRef === "7.10(a)")?.parentSectionRef).toBe("7.10");
    expect(nodes.some((n) => n.sectionRef === "7.12")).toBe(true);
  });
});

// =============================================================================
// PART 4 - RESOLUTION LAYER: fresh scripted-classifier fail-closed policy
// checks against resolveStructuralAmbiguity, plus the REAL (unmocked,
// no-credential) synthetic-fallback path
// =============================================================================

function scriptedCaller(verdictFor: (userContent: string) => "LIKELY_HEADING" | "LIKELY_PROSE_REFERENCE" | "UNCERTAIN"): StageCaller & { callCount: number } {
  let calls = 0;
  return {
    providerName: "auditor-scripted",
    model: "auditor-v1",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, userContent: string): Promise<T> {
      calls++;
      return schema.parse({ verdict: verdictFor(userContent), reason: "auditor-scripted", relatedSourceSpans: [] });
    },
    lastTelemetry: (): AnalyzerCallTelemetry | null => null,
    get callCount() {
      return calls;
    },
  } as StageCaller & { callCount: number };
}

/** Discriminates by CALL ORDER rather than by bounded-window text content -
 * `resolveStructuralAmbiguity` calls the classifier once per ambiguous
 * candidate strictly in the candidates array's own document order
 * (`decideRawStructuralCandidates` sorts ascending by charStart), so this is
 * a reliable, order-based discriminator. A bare substring check on
 * `userContent` is NOT reliable here: two ambiguous candidates sitting
 * within ~300 chars of each other (this file's own `TRIAGE_WINDOW_CHARS`)
 * legitimately see each other's own title text inside their bounded
 * preceding/following windows, so "userContent.includes(candidate's own
 * number/title)" can true-positive on the WRONG call. */
function scriptedCallerByOrder(verdicts: ("LIKELY_HEADING" | "LIKELY_PROSE_REFERENCE" | "UNCERTAIN")[]): StageCaller & { callCount: number } {
  let calls = 0;
  return {
    providerName: "auditor-scripted-ordered",
    model: "auditor-v1",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      const verdict = verdicts[calls] ?? "UNCERTAIN";
      calls++;
      return schema.parse({ verdict, reason: "auditor-scripted-ordered", relatedSourceSpans: [] });
    },
    lastTelemetry: (): AnalyzerCallTelemetry | null => null,
    get callCount() {
      return calls;
    },
  } as StageCaller & { callCount: number };
}

describe("AUDITOR MATRIX (fresh) - resolution layer fail-closed policy and cost discipline", () => {
  const IDENTITY = { companyId: "aud-co", instrumentKey: "aud-inst", sourceDocumentId: "aud-resolve-doc" };

  it("mixed verdicts (LIKELY_PROSE_REFERENCE + UNCERTAIN) across two ambiguous candidates in one fresh document: both fail-closed excluded, zero rank-stack corruption, and exactly one classifier call per ambiguous candidate", async () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.\n" +
      "Section 7.11 Limitation on Sale-Leasebacks. This restriction cross-references the Asset Sale covenant described elsewhere in this Agreement.\n" +
      "(a) Real clause under 7.10.\n\n" +
      "Section 7.12 Limitation on Hedging. The Borrower shall not enter into speculative Hedging Agreements.";
    const doc = { documentId: "aud-resolve-doc", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    expect(ambiguousCandidates.map((c) => c.candidateNumber).sort()).toEqual(["7.09", "7.11"]);

    // 7.09 is document-ordered first, 7.11 second - see scriptedCallerByOrder's own doc comment for why order (not a text substring) is the reliable discriminator here.
    const caller = scriptedCallerByOrder(["LIKELY_PROSE_REFERENCE", "UNCERTAIN"]);
    const { nodes, reviewSignals, resolutions } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, new InMemoryStructuralAmbiguityCache());

    expect(caller.callCount).toBe(2); // exactly one classifier call per ambiguous candidate, never more
    expect(nodes.some((n) => n.sectionRef === "7.09")).toBe(false);
    expect(nodes.some((n) => n.sectionRef === "7.11")).toBe(false);
    expect(nodes.find((n) => n.sectionRef === "7.08(a)")?.parentSectionRef).toBe("7.08");
    expect(nodes.find((n) => n.sectionRef === "7.10(a)")?.parentSectionRef).toBe("7.10");
    expect(nodes.some((n) => n.sectionRef === "7.12")).toBe(true);
    expect(reviewSignals).toHaveLength(1); // only the genuinely UNCERTAIN one gets a review signal, not the confidently-resolved PROSE_REFERENCE one
    expect(reviewSignals[0]!.sourceEvidence).toContain("7.11");
    expect(reviewSignals[0]!.classifierVerdict).toBe("UNCERTAIN");

    const metrics = computeStructuralAmbiguityResolutionRateMetrics(6, resolutions);
    expect(metrics.classifierInvocationRate).toBeCloseTo(2 / 6, 6);
    expect(metrics.likelyProseReferenceCount).toBe(1);
    expect(metrics.uncertainCount).toBe(1);
  });

  it("a LIKELY_HEADING verdict genuinely rescues a real (deterministically-missed) heading with correct parentage - fresh construction, distinct topic from the definitions-style matrix case above", () => {
    return (async () => {
      const text = "Section 3.01 Applicable Rate. Real prior text ends here.\nSection 3.02 Available Increase. means, with respect to the Incremental Facility, the amount set forth on Schedule 3.";
      const doc = { documentId: "aud-rescue-doc", label: "d", text };
      const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
      expect(ambiguousCandidates.some((c) => c.candidateNumber === "3.02")).toBe(true);
      const caller = scriptedCaller(() => "LIKELY_HEADING");
      const { nodes } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
      expect(nodes.some((n) => n.sectionRef === "3.02")).toBe(true);
    })();
  });

  it("a classifier call that throws (transport failure) is treated identically to UNCERTAIN - fail-closed, never fabricates a boundary, fresh construction", async () => {
    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    const doc = { documentId: "aud-throw-doc", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    const throwingCaller: StageCaller = {
      providerName: "auditor-throwing",
      model: "v1",
      isSynthetic: false,
      async call(): Promise<never> {
        throw new Error("simulated gateway timeout");
      },
      lastTelemetry: () => null,
    };
    const { nodes, reviewSignals, resolutions } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, throwingCaller, new InMemoryStructuralAmbiguityCache());
    expect(nodes.some((n) => n.sectionRef === "7.09")).toBe(false);
    expect(resolutions[0]!.classifierResult.failed).toBe(true);
    expect(resolutions[0]!.appliedOverride).toBeNull();
    expect(reviewSignals).toHaveLength(1);
    expect(reviewSignals[0]!.classifierFailed).toBe(true);
  });

  it("REAL (unmocked) getStageCaller() in this sandbox is genuinely synthetic (no credential configured) and genuinely produces the fail-closed UNCERTAIN/failed/isSynthetic result for a fresh ambiguous candidate - not a scripted stand-in", async () => {
    expect(process.env.AI_GATEWAY_API_KEY).toBeFalsy();
    expect(process.env.ANTHROPIC_API_KEY).toBeFalsy();
    const realCaller = getStageCaller();
    expect(realCaller.isSynthetic).toBe(true);

    const text =
      "ARTICLE VII COVENANTS\n\n" +
      "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
      "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
      "(a) Permitted Investments existing on the Closing Date.\n\n" +
      "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.";
    const doc = { documentId: "aud-real-synthetic-doc", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    const { nodes, resolutions } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, realCaller, new InMemoryStructuralAmbiguityCache());
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]!.classifierResult.verdict).toBe("UNCERTAIN");
    expect(resolutions[0]!.classifierResult.failed).toBe(true);
    expect(resolutions[0]!.classifierResult.isSynthetic).toBe(true);
    expect(resolutions[0]!.appliedOverride).toBeNull();
    expect(nodes.some((n) => n.sectionRef === "7.09")).toBe(false);
  });

  it("runStructureStageWithAmbiguityResolution costs EXACTLY ZERO classifier calls for a document with only confident candidates - fresh document, real function under test (not the isolated resolveStructuralAmbiguity helper alone)", async () => {
    let calls = 0;
    const countingCaller: StageCaller = {
      providerName: "auditor-counting",
      model: "v1",
      isSynthetic: false,
      async call<T>(schema: ZodType<T>): Promise<T> {
        calls++;
        return schema.parse({ verdict: "UNCERTAIN", reason: "should never be called", relatedSourceSpans: [] });
      },
      lastTelemetry: () => null,
    };
    const cleanDoc = { documentId: "aud-clean-stage-doc", label: "d", text: "ARTICLE VI NEGATIVE COVENANTS\n\nSection 6.01 Indebtedness. The Borrower will not incur any Indebtedness.\n\nSection 6.02 Liens. The Borrower will not create any Lien.\n" };
    const result = await runStructureStageWithAmbiguityResolution([cleanDoc], { companyId: "aud-co", instrumentKey: "aud-inst" }, countingCaller);
    expect(calls).toBe(0);
    expect(result.metrics.ambiguousCount).toBe(0);
    expect(result.metrics.deterministicResolutionRate).toBe(1);
    expect(result.reviewSignals).toHaveLength(0);
    expect(result.output.map((n) => n.sectionRef).sort()).toEqual(["6.01", "6.02", "VI"]);
  });

  it("runStructureStageWithAmbiguityResolution across MULTIPLE documents: a clean document costs zero calls while a sibling document's own ambiguous candidate still gets exactly one call - per-document cost isolation, fresh construction", async () => {
    let calls = 0;
    const countingCaller: StageCaller = {
      providerName: "auditor-counting-2",
      model: "v1",
      isSynthetic: false,
      async call<T>(schema: ZodType<T>): Promise<T> {
        calls++;
        return schema.parse({ verdict: "UNCERTAIN", reason: "scripted", relatedSourceSpans: [] });
      },
      lastTelemetry: () => null,
    };
    const cleanDoc = { documentId: "aud-multi-clean", label: "d1", text: "ARTICLE VI NEGATIVE COVENANTS\n\nSection 6.01 Indebtedness. The Borrower will not incur any Indebtedness.\n" };
    const ambiguousDoc = {
      documentId: "aud-multi-ambiguous",
      label: "d2",
      text:
        "ARTICLE VII COVENANTS\n\n" +
        "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
        "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
        "(a) Permitted Investments existing on the Closing Date.\n\n" +
        "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.",
    };
    const result = await runStructureStageWithAmbiguityResolution([cleanDoc, ambiguousDoc], { companyId: "aud-co", instrumentKey: "aud-inst-multi" }, countingCaller);
    expect(calls).toBe(1); // only the ambiguous document's own 7.09 candidate ever reached the classifier
    expect(result.metrics.ambiguousCount).toBe(1);
    expect(result.output.some((n) => n.sectionRef === "6.01" && n.documentId === "aud-multi-clean")).toBe(true);
    expect(result.output.some((n) => n.sectionRef === "7.09")).toBe(false);
    expect(result.output.some((n) => n.sectionRef === "7.08" && n.documentId === "aud-multi-ambiguous")).toBe(true);
  });
});
