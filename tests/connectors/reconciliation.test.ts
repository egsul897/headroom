/**
 * Unit tests for lib/connectors/reconciliation.ts's reconcileFinancialFacts -
 * a PURE function, proven here with zero DB access (no prisma import
 * anywhere in this file) per the task's own explicit requirement.
 */
import { describe, expect, it } from "vitest";
import { reconcileFinancialFacts, DEFAULT_RELATIVE_TOLERANCE, type FinancialFactCandidateWithSource, type SourcePriorityRuleLike } from "../../lib/connectors/reconciliation";

// Defaults deliberately use "total_debt" (30-day staleness threshold) and an
// asOfDate close to the tests' own default `now` (2026-06-20) so that
// classification tests unrelated to staleness are not accidentally
// confounded by it - the dedicated staleness tests below set their own
// metricName/asOfDate/now explicitly.
function candidate(overrides: Partial<FinancialFactCandidateWithSource>): FinancialFactCandidateWithSource {
  return {
    candidateId: "c1",
    metricName: "total_debt",
    value: 100,
    asOfDate: "2026-06-15",
    sourceConnectionId: "conn-a",
    connectorType: "CSV_FINANCIAL",
    connectionSourcePriority: 0,
    reviewStatus: "PENDING",
    ...overrides,
  };
}

describe("reconcileFinancialFacts - purity", () => {
  it("is a plain function with no side effects: calling it twice with identical inputs produces identical (deep-equal) output", () => {
    const candidates = [candidate({ candidateId: "a", sourceConnectionId: "conn-a", value: 100 }), candidate({ candidateId: "b", sourceConnectionId: "conn-b", value: 101 })];
    const rules: SourcePriorityRuleLike[] = [];
    const now = new Date("2026-06-20");
    const first = reconcileFinancialFacts(candidates, rules, { now });
    const second = reconcileFinancialFacts(candidates, rules, { now });
    expect(second).toEqual(first);
    // The input arrays themselves are untouched (no in-place mutation).
    expect(candidates[0]!.value).toBe(100);
  });
});

describe("reconcileFinancialFacts - classification", () => {
  const now = new Date("2026-06-20");

  it("MATCH: two sources within tolerance", () => {
    const groups = reconcileFinancialFacts(
      [candidate({ candidateId: "a", sourceConnectionId: "conn-a", value: 1000000 }), candidate({ candidateId: "b", sourceConnectionId: "conn-b", value: 1000500, connectorType: "EDGAR" })],
      [],
      { now }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.classification).toBe("MATCH");
    expect(groups[0]!.toleranceUsed).toBe(DEFAULT_RELATIVE_TOLERANCE);
  });

  it("MATERIAL_DIFFERENCE: values disagree beyond tolerance but a SourcePriorityRule names a clear winner", () => {
    const rules: SourcePriorityRuleLike[] = [
      { companyId: null, metricName: "total_debt", connectorType: "DOCUMENT_UPLOAD", priority: 0 },
      { companyId: null, metricName: "total_debt", connectorType: "CSV_FINANCIAL", priority: 20 },
    ];
    const groups = reconcileFinancialFacts(
      [
        candidate({ candidateId: "csv-cash", sourceConnectionId: "conn-csv", value: 1000000, connectorType: "CSV_FINANCIAL" }),
        candidate({ candidateId: "upload-cash", sourceConnectionId: "conn-upload", value: 1200000, connectorType: "DOCUMENT_UPLOAD" }),
      ],
      rules,
      { now }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.classification).toBe("MATERIAL_DIFFERENCE");
    expect(groups[0]!.winnerCandidateId).toBe("upload-cash");
    expect(groups[0]!.rationale).toMatch(/DOCUMENT_UPLOAD/);
  });

  it("CONFLICTING_SOURCE: values disagree beyond tolerance and no priority rule distinguishes them (same priority, or none configured)", () => {
    const groups = reconcileFinancialFacts(
      [candidate({ candidateId: "a", sourceConnectionId: "conn-a", value: 1000000, connectionSourcePriority: 10 }), candidate({ candidateId: "b", sourceConnectionId: "conn-b", value: 1300000, connectionSourcePriority: 10 })],
      [],
      { now }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.classification).toBe("CONFLICTING_SOURCE");
    expect(groups[0]!.winnerCandidateId).toBeUndefined();
  });

  it("STALE_SOURCE: a value's asOfDate exceeds the per-metric staleness threshold, even when values agree", () => {
    const groups = reconcileFinancialFacts(
      [
        candidate({ candidateId: "a", sourceConnectionId: "conn-a", metricName: "cash", value: 100, asOfDate: "2026-06-01" }), // 19 days stale for cash (threshold 1 day)
        candidate({ candidateId: "b", sourceConnectionId: "conn-b", metricName: "cash", value: 100, asOfDate: "2026-06-19" }), // same UTC month as above -> same reconciliation group
      ],
      [],
      { now: new Date("2026-06-20") }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.classification).toBe("STALE_SOURCE");
    expect(groups[0]!.stalenessThresholdDays).toBe(1);
  });

  it("a metric with no configured staleness threshold falls back to the generous 180-day default", () => {
    const groups = reconcileFinancialFacts(
      [
        candidate({ candidateId: "a", sourceConnectionId: "conn-a", metricName: "some_unlisted_metric", value: 100, asOfDate: "2026-06-01" }),
        candidate({ candidateId: "b", sourceConnectionId: "conn-b", metricName: "some_unlisted_metric", value: 101, asOfDate: "2026-06-02" }),
      ],
      [],
      { now: new Date("2026-06-20") }
    );
    expect(groups[0]!.stalenessThresholdDays).toBe(180);
    expect(groups[0]!.classification).toBe("MATCH");
  });

  it("a single-source group (only one distinct sourceConnectionId) is not returned at all - nothing to reconcile", () => {
    const groups = reconcileFinancialFacts([candidate({ candidateId: "a", sourceConnectionId: "conn-a" }), candidate({ candidateId: "b", sourceConnectionId: "conn-a", value: 999999 })], [], { now });
    expect(groups).toHaveLength(0);
  });

  it("groups are scoped by (metricName, calendar month of asOfDate) - different months never merge", () => {
    const groups = reconcileFinancialFacts(
      [
        candidate({ candidateId: "a", sourceConnectionId: "conn-a", asOfDate: "2026-01-15", value: 100 }),
        candidate({ candidateId: "b", sourceConnectionId: "conn-b", asOfDate: "2026-06-15", value: 100 }),
      ],
      [],
      { now }
    );
    // Each is a single-source group for its own period - correctly not reconciled together.
    expect(groups).toHaveLength(0);
  });

  it("company-specific SourcePriorityRule overrides the global default for the same (metricName, connectorType)", () => {
    const rules: SourcePriorityRuleLike[] = [
      { companyId: null, metricName: "total_debt", connectorType: "CSV_FINANCIAL", priority: 5 },
      { companyId: "acme", metricName: "total_debt", connectorType: "CSV_FINANCIAL", priority: 99 }, // this company demotes CSV for total_debt
      { companyId: null, metricName: "total_debt", connectorType: "DOCUMENT_UPLOAD", priority: 0 },
    ];
    const groups = reconcileFinancialFacts(
      [
        candidate({ candidateId: "csv", sourceConnectionId: "conn-csv", value: 1000000, connectorType: "CSV_FINANCIAL" }),
        candidate({ candidateId: "upload", sourceConnectionId: "conn-upload", value: 1200000, connectorType: "DOCUMENT_UPLOAD" }),
      ],
      rules,
      { now, companyId: "acme" }
    );
    expect(groups[0]!.classification).toBe("MATERIAL_DIFFERENCE");
    expect(groups[0]!.winnerCandidateId).toBe("upload"); // DOCUMENT_UPLOAD (0) still beats CSV even demoted further to 99
  });

  it("falls back to the connection's own connectionSourcePriority when no SourcePriorityRule matches at all", () => {
    const groups = reconcileFinancialFacts(
      [
        candidate({ candidateId: "a", sourceConnectionId: "conn-a", value: 1000000, connectionSourcePriority: 5 }),
        candidate({ candidateId: "b", sourceConnectionId: "conn-b", value: 1300000, connectionSourcePriority: 50 }),
      ],
      [],
      { now }
    );
    expect(groups[0]!.classification).toBe("MATERIAL_DIFFERENCE");
    expect(groups[0]!.winnerCandidateId).toBe("a");
  });
});
