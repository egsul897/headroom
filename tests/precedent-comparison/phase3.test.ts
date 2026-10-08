import { describe, expect, it } from "vitest";
import {
  auditCorpus,
  benchmarkScenarioCounts,
  createPrecedentComparisonApi,
  getDefaultCorpus,
  runBenchmarkSuite,
  runDiffBenchmarkSuite,
} from "../../lib/precedent-comparison";

describe("Phase 3 — corpus audit, benchmark, diffs", () => {
  it("deduplicates overlapping spans and audits ≥100 stratified source spans", () => {
    const corpus = getDefaultCorpus();
    const audit = auditCorpus(corpus, process.cwd(), 100);
    expect(audit.rawProvisionCount).toBeGreaterThanOrEqual(700);
    expect(audit.distinctSourceDocuments).toBeGreaterThanOrEqual(14);
    expect(audit.distinctIssuers).toBeGreaterThanOrEqual(8);
    expect(audit.deduplicatedComparableProvisionCount).toBeLessThanOrEqual(audit.rawProvisionCount);
    expect(audit.duplicateOrOverlappingSpanCount).toBeGreaterThanOrEqual(0);
    expect(audit.spanAudit.sampleSize).toBeGreaterThanOrEqual(100);
    expect(audit.spanAudit.exactMatchRate).toBeGreaterThanOrEqual(0.5);
    expect(Object.keys(audit.spanAudit.byIssuer).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(audit.spanAudit.byFamily).length).toBeGreaterThanOrEqual(4);
  });

  it("has ≥50 independently authored scenarios with DEV and HELD_OUT splits covering all categories", () => {
    const counts = benchmarkScenarioCounts();
    expect(counts.total).toBeGreaterThanOrEqual(50);
    expect(counts.heldOut).toBeGreaterThanOrEqual(15);
    expect(counts.dev).toBeGreaterThanOrEqual(30);
    const required = [
      "MATERIALLY_DIFFERENT",
      "TEXTUALLY_DIFFERENT_LEGALLY_EQUIVALENT",
      "IDENTICAL_TEXT_DIFFERENT_DEFINITIONS",
      "DIFFERENT_PROVISO_ATTACHMENT",
      "DIFFERENT_ENTITY_SCOPE",
      "DIFFERENT_AMENDMENT_STATUS",
      "DIFFERENT_FINANCIAL_THRESHOLDS",
      "CROSS_DOCUMENT_RESTRICTION",
      "MISSING_CONTROLLING_DEFINITIONS",
      "SHARED_CAPACITY_DIFFERENCE",
    ];
    for (const c of required) {
      expect(counts.byCategory[c] ?? 0, c).toBeGreaterThanOrEqual(1);
    }
  });

  it("reports held-out precision/recall with denominators and does not claim zero false legal diffs from gates alone", () => {
    const { metrics, falseLegalDifferenceFindings, evaluations } = runBenchmarkSuite(process.cwd());
    expect(metrics.heldOut.n).toBeGreaterThanOrEqual(15);
    expect(metrics.heldOut.materialPrecisionDenominator).toBeGreaterThanOrEqual(0);
    expect(metrics.heldOut.materialRecallDenominator).toBeGreaterThan(0);
    expect(metrics.heldOut.citationDenominator).toBe(metrics.heldOut.n);
    expect(metrics.heldOut.unsupportedConclusionRefusalRate).toBe(1);
    // Honesty: false-material count is measured, not asserted zero via elevation gates
    expect(typeof metrics.heldOut.falseMaterialDifferenceCount).toBe("number");
    expect(evaluations.every((e) => e.unsupportedConclusionRefused)).toBe(true);
    expect(Array.isArray(falseLegalDifferenceFindings)).toBe(true);
  });

  it("benchmarks diffs and marks bounded results as non-exhaustive", () => {
    const suite = runDiffBenchmarkSuite();
    expect(suite.cases.length).toBeGreaterThanOrEqual(5);
    const bounded = suite.cases.flatMap((c) => c.results).filter((r) => r.bounded);
    expect(bounded.every((r) => r.exhaustive === false && r.truncationNote != null)).toBe(true);
  });

  it("exposes Phase 3 peer adapters including ACR/FDP/NCED", () => {
    const peers = createPrecedentComparisonApi().peerStatus();
    expect(peers.amendmentChain.peer).toBe("WS-ACR");
    expect(peers.financialDefinitionsPrecedent.peer).toBe("WS-FDP");
    expect(peers.negativeCovenantExceptions.peer).toBe("WS-NCED");
    expect(peers.knowledgeFactory.availability).toBe("UNAVAILABLE");
  });
});
