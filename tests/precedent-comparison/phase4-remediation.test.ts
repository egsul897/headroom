import { describe, expect, it } from "vitest";
import {
  ALL_BENCHMARK_SCENARIOS,
  ALL_PHASE4_SCENARIOS,
  auditContextIncompleteness,
  compareProvisions,
  createPrecedentComparisonApi,
  getDefaultCorpus,
  importCkfExportIntoCorpus,
  phase4ScenarioCounts,
  probeCkfExportMount,
  runBenchmarkSuite,
  evaluateScenario,
} from "../../lib/precedent-comparison";
import { PHASE4_HELD_OUT_SCENARIOS } from "../../lib/precedent-comparison/benchmark/phase4-scenarios";
import { aggregateMetrics } from "../../lib/precedent-comparison/benchmark/evaluate";

describe("Phase 4 — false legal-difference remediation", () => {
  it("D18: ratio orthography 4.00 to 1.00 vs 4.00:1.00 is not a material legal difference", () => {
    const s = ALL_BENCHMARK_SCENARIOS.find((x) => x.id === "D18")!;
    const r = compareProvisions(s.left, s.right);
    expect(r.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" && c.dimension === "ECONOMICS")).toBe(false);
    expect(evaluateScenario(s).falseMaterialDifference).toBe(false);
  });

  it("D18 positive control: 4.00 vs 3.50 remains a material economics difference", () => {
    const s = ALL_BENCHMARK_SCENARIOS.find((x) => x.id === "D18")!;
    const right = { ...s.right, sourceText: "Maximum Total Net Leverage Ratio shall not exceed 3.50:1.00.", sourceVersionHash: "x" };
    const r = compareProvisions(s.left, right);
    expect(r.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" && c.dimension === "ECONOMICS")).toBe(true);
  });

  it("D28: ordinary-course hyphenation is not a material structure difference", () => {
    const s = ALL_BENCHMARK_SCENARIOS.find((x) => x.id === "D28")!;
    const r = compareProvisions(s.left, s.right);
    expect(r.leftFeatures.features).toContain("ORDINARY_COURSE_CARVEOUT");
    expect(r.rightFeatures.features).toContain("ORDINARY_COURSE_CARVEOUT");
    expect(r.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" && c.dimension === "STRUCTURE")).toBe(false);
    expect(evaluateScenario(s).falseMaterialDifference).toBe(false);
  });

  it("D28 positive control: ordinary-course vs no ordinary-course remains material", () => {
    const s = ALL_BENCHMARK_SCENARIOS.find((x) => x.id === "D28")!;
    const right = {
      ...s.right,
      sourceText: "Affiliate Transactions on arm's-length terms not less favorable to the Loan Parties.",
      sourceVersionHash: "y",
    };
    const r = compareProvisions(s.left, right);
    expect(r.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")).toBe(true);
  });

  it("H02: Borrower naming alone is not a material scope/structure legal difference", () => {
    const s = ALL_BENCHMARK_SCENARIOS.find((x) => x.id === "H02")!;
    const ev = evaluateScenario(s);
    expect(ev.falseMaterialDifference).toBe(false);
    expect(ev.materialPredicted).toBe(false);
  });

  it("H02/D05 positive control: Borrower vs Restricted Subsidiary remains material scope", () => {
    const s = ALL_BENCHMARK_SCENARIOS.find((x) => x.id === "D05")!;
    expect(evaluateScenario(s).missedMaterialDifference).toBe(false);
    expect(evaluateScenario(s).materialPredicted).toBe(true);
  });
});

describe("Phase 4 — context assembly and evaluation expansion", () => {
  it("classifies incomplete controlling context and attempts peer assembly", () => {
    const report = auditContextIncompleteness(getDefaultCorpus(), 100);
    expect(report.sampleSize).toBeGreaterThanOrEqual(100);
    expect(report.incompleteBeforeAssembly).toBeGreaterThan(0);
    expect(report.incompleteAfterAssembly).toBeLessThanOrEqual(report.incompleteBeforeAssembly);
    const kinds = Object.values(report.byKind).reduce((a, b) => a + b, 0);
    expect(kinds).toBeGreaterThan(0);
  });

  it("adds ≥50 issuer/document-disjoint Phase 4 scenarios with independent labels", () => {
    const counts = phase4ScenarioCounts();
    expect(counts.total).toBeGreaterThanOrEqual(50);
    expect(counts.heldOut).toBeGreaterThanOrEqual(15);
    expect(counts.distinctIssuers).toBeGreaterThanOrEqual(8);
    expect(counts.distinctDocuments).toBeGreaterThanOrEqual(16);
    // Disjoint from Phase 3 synthetic package id
    expect(ALL_PHASE4_SCENARIOS.every((s) => s.left.locator.packageId.startsWith("p4-"))).toBe(true);
  });

  it("reports Phase 4 held-out metrics with numerators/denominators", () => {
    const evals = PHASE4_HELD_OUT_SCENARIOS.map((s) => evaluateScenario(s));
    const m = aggregateMetrics(evals, "HELD_OUT");
    expect(m.n).toBeGreaterThanOrEqual(15);
    expect(m.materialRecallDenominator).toBeGreaterThan(0);
    expect(m.citationDenominator).toBe(m.n);
    expect(m.unsupportedConclusionRefusalRate).toBe(1);
    expect(typeof m.falseMaterialDifferenceCount).toBe("number");
    expect(typeof m.missedMaterialDifferenceCount).toBe("number");
  });

  it("Phase 3 held-out false-material count is remediated to zero on D18/D28/H02 class", () => {
    const { falseLegalDifferenceFindings } = runBenchmarkSuite();
    const ids = falseLegalDifferenceFindings.map((f) => f.scenarioId);
    expect(ids).not.toContain("D18");
    expect(ids).not.toContain("D28");
    expect(ids).not.toContain("H02");
  });

  it("CKF import probes mount honestly and does not treat samples as production", () => {
    const probe = probeCkfExportMount();
    const report = importCkfExportIntoCorpus(process.cwd(), { write: false });
    expect(report.attempted).toBe(true);
    if (!probe.mounted) {
      expect(report.imported).toBe(0);
      expect(report.note).toMatch(/will not fabricate a second SEC downloader|not present|sample/i);
    }
    expect(createPrecedentComparisonApi().peerStatus().knowledgeFactory.peer).toBe("WS-CKF");
  });
});
