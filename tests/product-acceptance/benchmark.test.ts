/**
 * Extraction-architecture benchmark: pins the evidence the architectural recommendation rests on. Every assertion is
 * about measured offline scope quality over the pinned corpus or about the honesty labels on the report; cost figures
 * are deterministic estimates and are only compared relatively.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadCases, runBenchmark, type BenchmarkReport } from "../../scripts/product-acceptance/benchmark/run";

let r: BenchmarkReport;
beforeAll(async () => { r = await runBenchmark(); }, 600_000);

const byId = (id: string) => r.cases.find((c) => c.caseId === id)!;

describe("benchmark contract", () => {
  it("covers the thirteen required adversarial classes plus the 'cheapest strategy appears successful' scenario", () => {
    const classes = new Set(loadCases().map((c) => c.adversarialClass));
    for (const k of ["DEBT_BASKET_SUBJECT_TO_SEPARATE_LIEN_COVENANT", "RP_EXCEPTION_CONSTRAINED_BY_DEFINITION_ELSEWHERE", "RATIO_BASKET_AFFECTED_BY_ANOTHER_DOCUMENT", "AMENDMENT_SILENTLY_REPLACES_THRESHOLD", "DEFINITION_WITH_NESTED_DEPENDENCIES", "EXCEPTION_LIMITED_TO_CERTAIN_SUBSIDIARIES", "TOC_ENTRY_RESEMBLING_OPERATIVE_LANGUAGE", "COVENANT_FAMILY_WITH_UNEXPECTED_HEADING", "RESTRICTION_OUTSIDE_EXPECTED_ARTICLE", "SHARED_CAPACITY_ACROSS_BASKETS", "PERMITTED_TRANSACTION_WITH_MULTIPLE_INDEPENDENT_CONDITIONS", "CROSS_REFERENCE_THAT_CANNOT_BE_RESOLVED", "MISSING_DOCUMENT_PREVENTS_COMPLETE_ANSWER", "CHEAPEST_STRATEGY_APPEARS_SUCCESSFUL"]) expect(classes.has(k), k).toBe(true);
  });
  it("labels evidence honestly: quality measured offline, strategies B/C evaluation models, cost estimated, latency projected", () => {
    expect(r.evidenceLabels).toEqual({ quality: "MEASURED_OFFLINE_OVER_FIXTURES", cost: "DETERMINISTIC_ESTIMATE", latency: "HYPOTHETICAL_PROJECTION", strategiesB_C: "EVALUATION_MODEL", strategyA: "PRODUCTION_POPULATION" });
    for (const c of r.cases) for (const s of Object.values(c.strategies)) { expect(s.cost.label).toBe("DETERMINISTIC_ESTIMATE"); expect(s.cost.projectedLatencyS.label).toBe("HYPOTHETICAL_PROJECTION"); }
  });
  it("is deterministic", async () => {
    const again = await runBenchmark();
    expect(JSON.stringify(again.aggregate)).toBe(JSON.stringify(r.aggregate));
  }, 600_000);
});

describe("measured results the recommendation rests on", () => {
  it("naive selective retrieval produces false permissions on this corpus; broad and hybrid produce none", () => {
    expect(r.aggregate.B_NAIVE_SELECTIVE.falsePermissions).toBeGreaterThanOrEqual(3);
    expect(r.aggregate.A_BROAD.falsePermissions).toBe(0);
    expect(r.aggregate.C_HYBRID.falsePermissions).toBe(0);
  });
  it("at least one case where the cheapest strategy returns a plausible, non-empty answer that omits a material restriction", () => {
    const c = byId("BM-14").strategies.B_NAIVE_SELECTIVE;
    expect(c.scope.units.length).toBeGreaterThan(0);
    expect(c.quality.outcome).toBe("PLAUSIBLE_BUT_INCOMPLETE");
    expect(c.quality.dangerousOmissions.length).toBeGreaterThanOrEqual(1);
    expect(byId("BM-01").strategies.B_NAIVE_SELECTIVE.quality.falsePermission).toBe(true);
  });
  it("hybrid closure matches broad compilation on material restriction and condition recall", () => {
    expect(r.aggregate.C_HYBRID.restrictionRecall).toEqual(r.aggregate.A_BROAD.restrictionRecall);
    expect(r.aggregate.C_HYBRID.conditionRecall).toEqual(r.aggregate.A_BROAD.conditionRecall);
    expect(r.aggregate.C_HYBRID.restrictionRecall.hit).toBeGreaterThan(r.aggregate.B_NAIVE_SELECTIVE.restrictionRecall.hit);
  });
  it("broad and hybrid surface every fail-closed case (missing document, unresolved term, undefined inputs); naive does not", () => {
    expect(r.aggregate.A_BROAD.failClosedCorrect.hit).toBe(r.aggregate.A_BROAD.failClosedCorrect.of);
    expect(r.aggregate.C_HYBRID.failClosedCorrect.hit).toBe(r.aggregate.C_HYBRID.failClosedCorrect.of);
    expect(r.aggregate.B_NAIVE_SELECTIVE.failClosedCorrect.hit).toBeLessThan(r.aggregate.B_NAIVE_SELECTIVE.failClosedCorrect.of);
  });
  it("hybrid is estimated cheaper than broad and dispatches fewer units, while naive is not substantially cheaper than hybrid", () => {
    expect(r.aggregate.C_HYBRID.estimatedUsd).toBeLessThan(r.aggregate.A_BROAD.estimatedUsd);
    expect(r.aggregate.C_HYBRID.modelCalls).toBeLessThan(r.aggregate.A_BROAD.modelCalls);
    expect(r.aggregate.B_NAIVE_SELECTIVE.estimatedUsd).toBeGreaterThan(r.aggregate.C_HYBRID.estimatedUsd * 0.5);
  });
  it("without an operative-source gate, both broad and hybrid still dispatch a table-of-contents occurrence (recorded; the PR #136 gate is the fix)", () => {
    expect(byId("BM-07").strategies.A_BROAD.quality.forbiddenUnitsInScope).toEqual(["credit-agreement#7.06#1"]);
    expect(byId("BM-07").strategies.C_HYBRID.quality.forbiddenUnitsInScope).toEqual(["credit-agreement#7.06#1"]);
  });
  it("hybrid discloses what it did not examine instead of claiming completeness", () => {
    for (const c of r.cases) { const s = c.strategies.C_HYBRID.scope; expect(typeof s.notExamined).toBe("number"); }
    expect(byId("BM-13").strategies.C_HYBRID.scope.missingDocuments.map((m) => m.toLowerCase())).toContain("term loan agreement");
  });
  it("incremental recompilation after one amended clause touches a fraction of the broad population under content addressing", () => {
    const c = r.incremental.find((i) => i.strategy === "C_HYBRID")!, a = r.incremental.find((i) => i.strategy === "A_BROAD")!;
    expect(c.withContentAddressing).toBeLessThan(a.withoutContentAddressing);
  });
});
