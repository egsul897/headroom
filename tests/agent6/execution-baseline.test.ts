/**
 * Pins Agent 6 execution-baseline invariants: A6-D4 provisional family,
 * Pass A ≠ LLM discovery, stop before fabricated capacity, refusals ≠ capacity.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "docs/agent-6-authentic-company-e2e";
const BASELINE = join(OUT, "06-execution-baseline");
const BENCHMARK = join(OUT, "07-product-benchmark");

describe("Agent 6 — execution readiness baseline pins", () => {
  it("aggregate baseline exists with $0 cost and credential gate", () => {
    const agg = JSON.parse(readFileSync(join(BASELINE, "aggregate.json"), "utf8")) as {
      costUsd: number;
      credentialGate: string;
      autonomousE2EReadinessClaimed: boolean;
      companies: Array<{
        companyKey: string;
        stoppingStage: string;
        stoppingFailureClass: string;
        passAExecutableCount: number;
        correctRefusalsCountedAsCapacity: boolean;
        remainingCapacity: null;
      }>;
    };
    expect(agg.costUsd).toBe(0);
    expect(agg.credentialGate).toBe("BLOCKED_BY_MISSING_CREDENTIAL");
    expect(agg.autonomousE2EReadinessClaimed).toBe(false);
    expect(agg.companies).toHaveLength(3);
    expect(agg.companies.every((c) => c.stoppingStage === "LEGAL_INTERPRETATION")).toBe(true);
    expect(agg.companies.every((c) => c.stoppingFailureClass === "OPERATIONAL_CREDENTIAL")).toBe(true);
    expect(agg.companies.every((c) => c.passAExecutableCount === 0)).toBe(true);
    expect(agg.companies.every((c) => c.correctRefusalsCountedAsCapacity === false)).toBe(true);
    expect(agg.companies.every((c) => c.remainingCapacity === null)).toBe(true);
  });

  it("Knife River provisional family associates amendments without operative upgrade", () => {
    const kr = JSON.parse(readFileSync(join(BASELINE, "knife-river-2023-2026", "baseline.json"), "utf8")) as {
      stages: Array<{
        stage: string;
        failureClass?: string;
        detail?: {
          instruments?: Array<Record<string, unknown>>;
          legallyConfirmedAmendmentChain?: boolean;
          mayConsolidateOperativeAgreement?: boolean;
          a6d4?: { knifeRiverFamilyAssociation: boolean; provisionalIsNotConfirmedOperative?: boolean };
        };
      }>;
    };
    const graph = kr.stages.find((s) => s.stage === "PACKAGE_GRAPH")!;
    expect(graph.detail?.a6d4?.knifeRiverFamilyAssociation).toBe(true);
    const facility = graph.detail?.instruments?.find((i) => i.baseDocumentId === "doc-a")!;
    expect(facility.associationKind).toBe("PROVISIONAL_FAMILY");
    expect(facility.reviewStatus).toBe("REVIEW_REQUIRED");
    expect((facility.documentIds as string[]).sort()).toEqual(["doc-a", "doc-b", "doc-c"]);
    expect(graph.detail?.legallyConfirmedAmendmentChain).toBe(false);
    expect(graph.detail?.mayConsolidateOperativeAgreement).toBe(false);
    expect(graph.detail?.a6d4?.provisionalIsNotConfirmedOperative).toBe(true);
  });

  it("product benchmark separates Pass A recall from verified rules and capacity", () => {
    for (const key of ["knife-river-2023-2026", "insulet-2021-2026", "benchmark-2025"]) {
      const b = JSON.parse(readFileSync(join(BENCHMARK, `${key}.json`), "utf8")) as {
        measures: {
          covenantDiscoveryRecall: { mode: string; llmAssistedDiscovery: string };
          legalRuleCorrectness: { verifiedRules: number };
          numericalCapacityCorrectness: { grossCapacity: null; remainingCapacity: null; status: string };
          falseFavorableOutcomes: { count: number };
          correctRefusals: { countedAsCapacity: boolean };
        };
      };
      expect(b.measures.covenantDiscoveryRecall.mode).toBe("DETERMINISTIC_PASS_A_ONLY");
      expect(b.measures.covenantDiscoveryRecall.llmAssistedDiscovery).toBe("NOT_RUN");
      expect(b.measures.legalRuleCorrectness.verifiedRules).toBe(0);
      expect(b.measures.numericalCapacityCorrectness.status).toBe("NOT_COMPUTED");
      expect(b.measures.numericalCapacityCorrectness.grossCapacity).toBeNull();
      expect(b.measures.falseFavorableOutcomes.count).toBe(0);
      expect(b.measures.correctRefusals.countedAsCapacity).toBe(false);
    }
  });

  it("discovery coordination artifact distinguishes deterministic vs LLM discovery", () => {
    const path = join(BASELINE, "discovery-coordination.json");
    expect(existsSync(path)).toBe(true);
    const c = JSON.parse(readFileSync(path, "utf8")) as {
      status: string;
      distinction: { deterministicExtraction: string; llmAssistedDiscovery: string };
    };
    expect(c.status).toBe("PENDING_AUTHORIZED_INFERENCE");
    expect(c.distinction.llmAssistedDiscovery).toMatch(/NOT faked/);
  });

  it("authentic capacity attempt does not invent fixture IR or paid calls", () => {
    const a = JSON.parse(readFileSync(join(BASELINE, "authentic-capacity-attempt.json"), "utf8")) as {
      paidProvidersCalled: boolean;
      fixtureIrInvented: boolean;
    };
    expect(a.paidProvidersCalled).toBe(false);
    expect(a.fixtureIrInvented).toBe(false);
  });
});
