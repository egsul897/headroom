/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1 WIRING FIX) -
 * proof that the deterministic-triage + bounded-classifier architecture
 * (parseDocumentStructureWithTriage / structural-ambiguity-classifier.ts /
 * structural-ambiguity-resolution.ts, all built and unit-tested in commit
 * b017fee) is now GENUINELY reachable through the REAL top-level compiler
 * entry point, `runContractCompiler` (lib/contract-model/compiler/
 * orchestrator.ts) - never just the isolated module-level calls the prior
 * workstream's own 109 tests already exercised.
 *
 * Before this fix, orchestrator.ts's STRUCTURE stage called the old,
 * synchronous `runStructureStage` (-> `parseDocumentStructure`) directly -
 * `parseDocumentStructureWithTriage`, `resolveStructuralAmbiguity`, and
 * `classifyStructuralAmbiguity` were never invoked by any real compile run,
 * regardless of how well-tested they were in isolation. This file proves the
 * gap is closed by running the exact same falsifying reproduction the
 * independent auditor built (tests/certification/
 * part-b-final-fix1-independent-recert.test.ts, Part 2, first case: a
 * well-punctuated in-prose citation of "Section 6.09 Limitation on
 * Restricted Payments." immediately followed by an ordinary new sentence -
 * byte-identical, on purely typographic grounds, to a real heading opening
 * its own body) through `runContractCompiler` itself, with zero mocking of
 * any structural/classifier module - only the ambient absence of
 * AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY in this sandbox (confirmed below),
 * which is the SAME real, unmocked `getStageCaller()` selection order every
 * other real compiler stage in this codebase already runs under here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { runContractCompiler } from "../../lib/contract-model/compiler/orchestrator";

const COMPANY_ID = "fixture-structural-ambiguity-wiring-co";
const DOCUMENT_ID = "fixture-structural-ambiguity-wiring-doc";
const PACKAGE_KEY = "fixture-structural-ambiguity-wiring-pkg";

// The exact falsifying reproduction (Part 2, first case, of
// tests/certification/part-b-final-fix1-independent-recert.test.ts): 6.08 and
// 6.10 are ordinary, unambiguous real headings; 6.09 is a well-punctuated
// in-prose CITATION of a section's own title, immediately followed by an
// ordinary capitalized new sentence - typographically indistinguishable from
// a real heading whose body starts with an ordinary sentence.
const TEXT =
  "ARTICLE VI COVENANTS\n\n" +
  "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
  "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
  "(a) Permitted Liens existing on the Closing Date.\n\n" +
  "Section 6.10 Liens. The Borrower shall not create Liens.";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Phase 3F.1 OPEN-1 wiring fix - runContractCompiler's REAL STRUCTURE stage reaches the triage + bounded classifier architecture", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Structural Ambiguity Wiring Co (test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Wiring Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);

  it("this sandbox genuinely has no real LLM credential configured (the same ambient condition every assertion below depends on)", () => {
    // Not a mock - the real getStageCaller() selection order (llm-caller.ts)
    // falls through to the synthetic caller under exactly this condition.
    expect(process.env.AI_GATEWAY_API_KEY).toBeFalsy();
    expect(process.env.ANTHROPIC_API_KEY).toBeFalsy();
  });

  it("a real compile run through runContractCompiler resolves the AMBIGUOUS citation as UNCERTAIN via the real (synthetic-fallback) classifier path and fail-closed EXCLUDES it, never fabricating a false structural boundary - while the genuinely confident headings in the SAME document parse normally with zero classifier involvement", async () => {
    const summary = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: TEXT }] });

    const sectionRefs = summary.structuralNodes.map((n) => n.sectionRef).sort();

    // (b) No false structural boundary: 6.09 - the in-prose citation - was
    // NEVER accepted as a real heading. Before this fix, this exact
    // assertion could not even be evaluated against the real orchestrator's
    // own reachable code path in a way that involved the classifier at all -
    // the old `runStructureStage` had no AMBIGUOUS category, only a binary
    // accept/reject a purely typographic heuristic made unilaterally.
    expect(sectionRefs).not.toContain("6.09");

    // (c) The genuinely confident headings elsewhere in the SAME document
    // still parse normally - the fix did not regress, slow down, or route
    // unrelated confident content through the classifier at all.
    expect(sectionRefs).toEqual(expect.arrayContaining(["VI", "6.08", "6.10"]));
    // The real child clause (a) is still correctly parented to 6.08 - zero
    // rank-stack corruption from the excluded ambiguous candidate.
    const clauseA = summary.structuralNodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");

    // (a) THE CLASSIFIER PATH WAS ACTUALLY INVOKED (or its documented
    // fail-closed synthetic-fallback path was, since this sandbox has no
    // working credential - see the test above): `structuralAmbiguityMetrics`
    // and `structuralReviewSignals` are ONLY ever populated by
    // `runStructureStageWithAmbiguityResolution` actually running this run
    // (they default to `[]`/`null` on a cache-hit RESUME, and this is
    // guaranteed to be a fresh run - a brand-new company/document/package
    // fixture created immediately above, never persisted before).
    expect(summary.structuralAmbiguityMetrics).not.toBeNull();
    expect(summary.structuralAmbiguityMetrics!.ambiguousCount).toBe(1);
    expect(summary.structuralAmbiguityMetrics!.classifierInvocationRate).toBeGreaterThan(0);
    expect(summary.structuralAmbiguityMetrics!.classifierSyntheticCount).toBe(1);
    expect(summary.structuralAmbiguityMetrics!.uncertainCount).toBe(1);
    // Exactly one candidate (6.09) was ever routed to the classifier at all
    // - not the ARTICLE, not 6.08, not 6.10 - proving zero classifier
    // involvement for the confident headings, structurally (never merely by
    // coincidence of a synthetic stub returning a fixed answer).
    expect(summary.structuralAmbiguityMetrics!.totalCandidates).toBeGreaterThan(1);

    // The fail-closed review-state signal is a real, honest, non-silent
    // artifact of this run - not a swallowed failure.
    expect(summary.structuralReviewSignals).toHaveLength(1);
    const signal = summary.structuralReviewSignals[0]!;
    expect(signal.documentId).toBe(DOCUMENT_ID);
    expect(signal.candidateType).toBe("SECTION");
    expect(signal.sourceEvidence).toContain("6.09");
    expect(signal.classifierVerdict).toBe("UNCERTAIN");
    expect(signal.classifierFailed).toBe(true);
    expect(signal.classifierIsSynthetic).toBe(true); // the real, unmocked no-credential fallback - not a real semantic judgment mistaken for one.

    // The STRUCTURE stage itself still reports COMPLETED (a fail-closed
    // exclusion of one ambiguous candidate is not itself a stage failure -
    // only a zero-node package would be REVIEW_REQUIRED).
    const structureStage = summary.stages.find((s) => s.stage === "STRUCTURE");
    expect(structureStage?.status).toBe("COMPLETED");

    // And the persisted DocumentNode rows agree - the real persistence path
    // (persistStructuralNodes, run unmodified) reflects the same
    // fail-closed exclusion, not merely the in-memory summary.
    const persisted = await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID }, select: { sectionRef: true } });
    expect(persisted.map((n) => n.sectionRef)).not.toContain("6.09");
  });

  it("a document with ONLY confident headings (no ambiguous candidates at all) costs exactly zero classifier calls through the real orchestrator - cost discipline holds end-to-end, not just in isolation", async () => {
    const CLEAN_DOC_ID = "fixture-structural-ambiguity-wiring-clean-doc";
    await prisma.document.create({ data: { id: CLEAN_DOC_ID, companyId: COMPANY_ID, name: "Fixture Wiring Clean Credit Agreement", type: "CREDIT_AGREEMENT" } });
    try {
      const cleanText = "ARTICLE VI NEGATIVE COVENANTS\n\nSection 6.01. Indebtedness. The Borrower will not incur any Indebtedness.\n\nSection 6.02. Liens. The Borrower will not create any Lien.";
      const summary = await runContractCompiler({ companyId: COMPANY_ID, packageKey: `${PACKAGE_KEY}-clean`, documents: [{ documentId: CLEAN_DOC_ID, label: "Clean Credit Agreement", text: cleanText }] });

      expect(summary.structuralNodes.map((n) => n.sectionRef).sort()).toEqual(["6.01", "6.02", "VI"]);
      expect(summary.structuralAmbiguityMetrics).not.toBeNull();
      expect(summary.structuralAmbiguityMetrics!.ambiguousCount).toBe(0);
      expect(summary.structuralAmbiguityMetrics!.classifierInvocationRate).toBe(0);
      expect(summary.structuralAmbiguityMetrics!.deterministicResolutionRate).toBe(1);
      expect(summary.structuralReviewSignals).toHaveLength(0);
    } finally {
      await prisma.contractCompilerRun.deleteMany({ where: { companyId: COMPANY_ID, packageKey: `${PACKAGE_KEY}-clean` } });
      await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID, documentId: CLEAN_DOC_ID } });
      await prisma.document.deleteMany({ where: { id: CLEAN_DOC_ID } });
    }
  });
});
