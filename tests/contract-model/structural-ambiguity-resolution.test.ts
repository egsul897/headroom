/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1) - end-to-end
 * coverage for the async phase-2 resolver (structural-ambiguity-resolution.ts):
 * AMBIGUOUS candidates from `parseDocumentStructureWithTriage` resolved
 * through the bounded classifier, fail-closed policy enforcement (LIKELY_HEADING
 * accepts, LIKELY_PROSE_REFERENCE/UNCERTAIN/failure never fabricates a
 * boundary), rate metrics, and the REAL no-credential SyntheticStageCaller
 * fail-safe path this sandbox can actually exercise honestly (no
 * AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY configured - confirmed via
 * `getStageCaller()` itself, not assumed).
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { parseDocumentStructureWithTriage } from "../../lib/contract-model/compiler/stage-structure";
import { resolveStructuralAmbiguity, computeStructuralAmbiguityResolutionRateMetrics } from "../../lib/contract-model/compiler/structural-ambiguity-resolution";
import { InMemoryStructuralAmbiguityCache } from "../../lib/contract-model/compiler/structural-ambiguity-classifier";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const IDENTITY = { companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" };

function scriptedCaller(verdictFor: (userContent: string) => "LIKELY_HEADING" | "LIKELY_PROSE_REFERENCE" | "UNCERTAIN"): StageCaller & { callCount: number } {
  let calls = 0;
  return {
    providerName: "test-provider",
    model: "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, userContent: string): Promise<T> {
      calls++;
      return schema.parse({ verdict: verdictFor(userContent), reason: "scripted", relatedSourceSpans: [] });
    },
    lastTelemetry: (): AnalyzerCallTelemetry | null => null,
    get callCount() {
      return calls;
    },
  } as StageCaller & { callCount: number };
}

// =============================================================================
// FAIL-CLOSED POLICY
// =============================================================================
describe("structural-ambiguity-resolution - fail-closed policy", () => {
  it("LIKELY_HEADING creates the structural boundary (a real, previously-excluded false negative is rescued)", async () => {
    const text = "Section 1.07 Applicable Rate. Real prior text.\nSection 1.08 Applicable Margin. means, with respect to any Loan, the percentage set forth in the Pricing Grid.";
    const doc = { documentId: "resolve-likely-heading", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    expect(ambiguousCandidates.some((c) => c.candidateNumber === "1.08")).toBe(true);
    const caller = scriptedCaller(() => "LIKELY_HEADING");
    const { nodes, resolutions } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(nodes.some((n) => n.sectionRef === "1.08")).toBe(true);
    expect(resolutions.find((r) => r.candidate.candidateNumber === "1.08")?.appliedOverride).toBe(true);
  });

  it("LIKELY_PROSE_REFERENCE never creates a structural boundary (the auditor's own falsifying construction, correctly resolved)", async () => {
    const text =
      "ARTICLE VI COVENANTS\n\n" +
      "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
      "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
      "(a) Permitted Liens existing on the Closing Date.\n\n" +
      "Section 6.10 Liens. The Borrower shall not create Liens.";
    const doc = { documentId: "resolve-likely-prose-reference", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    expect(ambiguousCandidates.some((c) => c.candidateNumber === "6.09")).toBe(true);
    const caller = scriptedCaller((userContent) => (userContent.includes("6.09") ? "LIKELY_PROSE_REFERENCE" : "LIKELY_HEADING"));
    const { nodes } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    // Zero material rank-stack corruption: the real (a) clause stays parented to its true enclosing section.
    const clauseA = nodes.find((n) => n.sectionRef.endsWith("(a)"));
    expect(clauseA?.parentSectionRef).toBe("6.08");
  });

  it("UNCERTAIN never creates a structural boundary - the candidate stays fail-closed excluded and a review signal is produced", async () => {
    const text = "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\nSection 6.09 Limitation on Restricted Payments. This citation refers to a limitation described elsewhere.";
    const doc = { documentId: "resolve-uncertain", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    const caller = scriptedCaller(() => "UNCERTAIN");
    const { nodes, reviewSignals } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    expect(reviewSignals.some((r) => r.candidateKey.includes("6.09".replace(".", "")) || r.sourceEvidence.includes("6.09"))).toBe(true);
    expect(reviewSignals.find((r) => r.sourceEvidence.includes("6.09"))?.classifierVerdict).toBe("UNCERTAIN");
  });

  it("a classifier call failure (simulated network error) never creates a structural boundary - identical fail-closed behavior to UNCERTAIN", async () => {
    const text = "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\nSection 6.09 Limitation on Restricted Payments. This citation refers to a limitation described elsewhere.";
    const doc = { documentId: "resolve-failure", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    const throwingCaller: StageCaller = {
      providerName: "test-provider",
      model: "test-model",
      isSynthetic: false,
      async call<T>(): Promise<T> {
        throw new Error("simulated network error");
      },
      lastTelemetry: () => null,
    };
    const { nodes, resolutions, reviewSignals } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, throwingCaller, new InMemoryStructuralAmbiguityCache());
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    expect(resolutions.every((r) => r.appliedOverride === null)).toBe(true);
    expect(reviewSignals.every((r) => r.classifierFailed)).toBe(true);
  });

  it("the REAL no-credential SyntheticStageCaller (getStageCaller() in this sandbox, which has no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY) never creates a structural boundary - the actual fail-safe path this environment can honestly exercise", async () => {
    const realCaller = getStageCaller();
    expect(realCaller.isSynthetic).toBe(true); // confirms this sandbox genuinely has no functioning credential, not merely assumed
    const text = "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\nSection 6.09 Limitation on Restricted Payments. This citation refers to a limitation described elsewhere.";
    const doc = { documentId: "resolve-real-synthetic-caller", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    expect(ambiguousCandidates.length).toBeGreaterThan(0);
    const { nodes, resolutions } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, realCaller, new InMemoryStructuralAmbiguityCache());
    expect(nodes.some((n) => n.sectionRef === "6.09")).toBe(false);
    expect(resolutions.every((r) => r.classifierResult.isSynthetic)).toBe(true);
    expect(resolutions.every((r) => r.classifierResult.failed)).toBe(true);
    expect(resolutions.every((r) => r.appliedOverride === null)).toBe(true);
  });
});

// =============================================================================
// COST DISCIPLINE
// =============================================================================
describe("structural-ambiguity-resolution - cost discipline", () => {
  it("the classifier is called exactly once per AMBIGUOUS candidate - zero calls for CONFIDENT_HEADING/CONFIDENT_PROSE_REFERENCE candidates", async () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\nSection 6.02 Liens. No Loan Party shall grant Liens.";
    const doc = { documentId: "cost-discipline-clean-document", label: "d", text };
    const { ambiguousCandidates, triageStats } = parseDocumentStructureWithTriage(doc);
    expect(ambiguousCandidates).toHaveLength(0);
    expect(triageStats.confidentHeadingCount).toBeGreaterThan(0);
    const caller = scriptedCaller(() => {
      throw new Error("classifier must never be called for a fully deterministic document");
    });
    const { nodes } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("a shared cache is reused across two resolution calls for the identical candidate", async () => {
    const text = "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\nSection 6.09 Limitation on Restricted Payments. This citation refers to a limitation described elsewhere.";
    const doc = { documentId: "cost-discipline-cache-reuse", label: "d", text };
    const { ambiguousCandidates } = parseDocumentStructureWithTriage(doc);
    const cache = new InMemoryStructuralAmbiguityCache();
    const caller = scriptedCaller(() => "LIKELY_PROSE_REFERENCE");
    await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, cache);
    await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, cache);
    expect(caller.callCount).toBe(ambiguousCandidates.length); // second run served entirely from cache
  });
});

// =============================================================================
// RATE METRICS
// =============================================================================
describe("structural-ambiguity-resolution - rate metrics", () => {
  it("computes deterministic resolution rate, classifier invocation rate, accuracy-relevant counts, and UNCERTAIN rate over a mixed matrix with known ground truth", async () => {
    const cases: { doc: { documentId: string; label: string; text: string }; expectHeading: boolean }[] = [
      {
        doc: { documentId: "metrics-1", label: "d", text: "Section 6.08 Restricted Payments. Real body.\nSection 6.09 Limitation on Restricted Payments. This citation refers to a limitation described elsewhere." },
        expectHeading: false,
      },
      {
        doc: { documentId: "metrics-2", label: "d", text: "Section 1.07 Applicable Rate. Real prior text.\nSection 1.08 Applicable Margin. means, with respect to any Loan, the percentage set forth in the Pricing Grid." },
        expectHeading: true,
      },
    ];
    let totalCandidates = 0;
    const allResolutions = [];
    const cache = new InMemoryStructuralAmbiguityCache();
    // A scripted caller playing a REALISTIC, accurate classifier for this
    // known-ground-truth matrix (never real-model validation - see this
    // file's own header) - used here only to prove the rate-metrics
    // ARITHMETIC is correct, not to claim any accuracy about a real model.
    const caller = scriptedCaller((userContent) => (userContent.includes("means, with respect") ? "LIKELY_HEADING" : "LIKELY_PROSE_REFERENCE"));
    for (const { doc, expectHeading } of cases) {
      const { ambiguousCandidates, triageStats } = parseDocumentStructureWithTriage(doc);
      totalCandidates += triageStats.totalCandidates;
      const { resolutions } = await resolveStructuralAmbiguity(doc, ambiguousCandidates, IDENTITY, caller, cache);
      allResolutions.push(...resolutions);
      for (const r of resolutions) {
        expect(r.appliedOverride).toBe(expectHeading); // classifier accuracy check against this test's own known ground truth
      }
    }
    const metrics = computeStructuralAmbiguityResolutionRateMetrics(totalCandidates, allResolutions);
    expect(metrics.totalCandidates).toBe(totalCandidates);
    expect(metrics.ambiguousCount).toBe(allResolutions.length);
    expect(metrics.classifierInvocationRate).toBeCloseTo(metrics.ambiguousCount / totalCandidates, 10);
    expect(metrics.deterministicResolutionRate).toBeCloseTo(1 - metrics.classifierInvocationRate, 10);
    expect(metrics.likelyHeadingCount + metrics.likelyProseReferenceCount + metrics.uncertainCount).toBe(metrics.ambiguousCount);
    expect(metrics.uncertainCount).toBe(0); // this scripted matrix never returns UNCERTAIN
    expect(metrics.classifierFailureCount).toBe(0);
  });

  it("a document with zero AMBIGUOUS candidates reports a 100% deterministic resolution rate and 0% classifier invocation rate", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\nSection 6.02 Liens. No Loan Party shall grant Liens.";
    const { triageStats } = parseDocumentStructureWithTriage({ documentId: "metrics-zero-ambiguous", label: "d", text });
    const metrics = computeStructuralAmbiguityResolutionRateMetrics(triageStats.totalCandidates, []);
    expect(metrics.deterministicResolutionRate).toBe(1);
    expect(metrics.classifierInvocationRate).toBe(0);
  });
});
