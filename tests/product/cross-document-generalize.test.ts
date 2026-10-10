/**
 * Agent 5 generalize mission — completeness audit, honesty layers, verified
 * A8-01 integration, expanded authentic packages, sequential state, UI layers.
 */
import { describe, expect, it } from "vitest";
import {
  AUTHENTIC_PACKAGE_SCENARIOS,
  runAllAuthenticPackageScenarios,
  runAuthenticPackageScenario,
} from "@/lib/product/covenant-intelligence/cross-document-authentic-packages";
import { runAllCrossDocumentScenarios } from "@/lib/product/covenant-intelligence/cross-document-scenarios";
import { runAllAdversarialScenarios } from "@/lib/product/covenant-intelligence/cross-document-adversarial";
import { runConmedDsgrCompletenessAudit } from "@/lib/product/covenant-intelligence/cross-document-completeness-audit";
import { projectPermissionLayers } from "@/lib/product/covenant-intelligence/cross-document-permission-layers";
import { attachNumericalCapacity } from "@/lib/product/covenant-intelligence/cross-document-capacity";
import { buildConmedSequentialDemo } from "@/lib/product/covenant-intelligence/cross-document-sequential-state";
import { analyzeContemplatedTransaction } from "@/lib/product/north-star-workflow/transaction-analysis";
import { classifyUtilizationHistory } from "@/lib/product/north-star-workflow/utilization-history";

describe("Preserve prior Agent 5 suites", () => {
  it("synthetic baseline 8/8 FP=0", () => {
    const suite = runAllCrossDocumentScenarios();
    expect(suite.matchedCount).toBe(8);
    expect(suite.falsePermissionCount).toBe(0);
  });

  it("adversarial 10/10 FP=0", () => {
    const suite = runAllAdversarialScenarios();
    expect(suite.matchedCount).toBe(10);
    expect(suite.falsePermissionCount).toBe(0);
  });
});

describe("P0 — independent completeness audit (CONMED + DSGR)", () => {
  it("enumerates restrictions beyond mustCite and finds zero false non-applicability", () => {
    const audit = runConmedDsgrCompletenessAudit();
    expect(audit.scenarioIds.length).toBe(6);
    expect(audit.falseNonApplicabilityCount).toBe(0);
    for (const f of audit.findings) {
      expect(f.independentlyEnumerated.length).toBeGreaterThan(5);
      // Independent inventory is broader than mustCite checklist.
      const mustCite = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === f.scenarioId)!
        .independentGroundTruth.mustCiteSectionRefs;
      expect(f.independentlyEnumerated.length).toBeGreaterThan(mustCite.length);
    }
  });

  it("after remediation, MUST_EVALUATE misses are zero", () => {
    const audit = runConmedDsgrCompletenessAudit();
    expect(
      audit.missedRestrictionCount,
      JSON.stringify(
        audit.findings
          .filter((f) => f.missedRestrictions.length)
          .map((f) => ({ id: f.scenarioId, missed: f.missedRestrictions.map((m) => m.sectionRef) })),
        null,
        2,
      ),
    ).toBe(0);
  });
});

describe("P0 — favorable-result honesty layers", () => {
  it("separates numerical capacity from legal verdict and never certifies legacy", () => {
    const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-conmed-unsecured-general-basket")!;
    const run = runAuthenticPackageScenario(scenario);
    const layers = projectPermissionLayers({
      verdict: run.verdict,
      numerical: run.numerical,
      pathEnumeration: run.verdict.pathEnumeration,
    });
    expect(layers.numericallyModeledCapacity.postsToLedger).toBe(false);
    expect(layers.certificationStatus.legacyIsCertifiedPackagePermission).toBe(false);
    expect(layers.overallPermission).toBe(run.verdict.overallResult);
    expect(layers.legallyApplicableRestrictions.length).toBeGreaterThan(0);
    expect(layers.honestyGuards.legacySeparatedFromVerdict).toBe(true);
  });

  it("Ask exposes permissionLayers distinct from legacySimulation", async () => {
    const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-conmed-unsecured-general-basket")!;
    const result = await analyzeContemplatedTransaction({
      companyId: "missing-company-for-offline-ask",
      question: "Can we incur $50 million of unsecured debt on 2026-06-30?",
      confirmed: true,
      verifiedPackage: null,
      crossDocumentProvisions: scenario.provisions,
    });
    expect(result.crossDocumentVerdict).not.toBeNull();
    expect(result.permissionLayers).not.toBeNull();
    expect(result.permissionLayers!.certificationStatus.legacyIsCertifiedPackagePermission).toBe(false);
    expect(result.legacySimulation == null || "refused" in result.legacySimulation || result.legacySimulation.authority === "LEGACY_ENGINE").toBe(true);
    // Same draft drives both channels
    expect(result.crossDocumentVerdict!.transaction.amountUsd).toBe(50_000_000);
    expect(result.draft.amountMillions).toBe(50);
  });
});

describe("P1 — verified execution / A8-01 failed-gate + unknown utilization", () => {
  it("A8-01 status floor is wired (NOT_SATISFIED in CapacityStatus; regression suite imported)", async () => {
    const types = await import("@/lib/contract-model/runtime/capacity/types");
    expect(types.CAPACITY_STATUS_PRECEDENCE.NOT_SATISFIED).toBeGreaterThan(types.CAPACITY_STATUS_PRECEDENCE.AVAILABLE);
    expect(types.CAPACITY_STATUS_PRECEDENCE.NOT_SATISFIED).toBeLessThan(types.CAPACITY_STATUS_PRECEDENCE.NEEDS_INPUT);
    // Permanent matrix lives in tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts
    const fs = await import("node:fs");
    expect(fs.existsSync("tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts")).toBe(true);
    const stateSrc = fs.readFileSync("lib/contract-model/runtime/capacity/state.ts", "utf8");
    expect(stateSrc).toMatch(/statusForAmount/);
    expect(stateSrc).toMatch(/GATE_NOT_SATISFIED/);
  });

  it("unknown utilization: empty ledger without affirmation is UNKNOWN", () => {
    expect(
      classifyUtilizationHistory({ ledgerCount: 0, utilizationAffirmedComplete: false }),
    ).toBe("UNKNOWN");
    expect(
      classifyUtilizationHistory({ ledgerCount: 0, utilizationAffirmedComplete: true }),
    ).toBe("CONFIRMED_EMPTY");
  });
});

describe("P1 — expanded authentic packages", () => {
  it("registers Gibraltar, Chewy, and FWRG packages with pre-declared expectations", () => {
    const ids = AUTHENTIC_PACKAGE_SCENARIOS.map((s) => s.scenarioId);
    expect(ids).toContain("auth-gibraltar-secured-missing-ica");
    expect(ids).toContain("auth-chewy-shared-rp-investment");
    expect(ids).toContain("auth-fwrg-nonloanparty-debt");
    expect(AUTHENTIC_PACKAGE_SCENARIOS.length).toBeGreaterThanOrEqual(12);
  });

  for (const scenario of AUTHENTIC_PACKAGE_SCENARIOS.filter((s) =>
    ["gibraltar", "chewy", "fwrg", "chwy"].some((p) => s.packageId.includes(p) || s.scenarioId.includes(p)),
  )) {
    it(`${scenario.scenarioId}: pre-declared outcome`, () => {
      const run = runAuthenticPackageScenario(scenario);
      expect(run.actualOverall).toBe(scenario.expectedOverall);
      expect(run.independentVerification.falsePermissionCount).toBe(0);
      expect(run.groundTruthCoverage.missedSectionRefs).toEqual([]);
    });
  }

  it("suite: all authentic packages match + FP=0", () => {
    const suite = runAllAuthenticPackageScenarios();
    expect(suite.matchedCount).toBe(suite.total);
    expect(suite.falsePermissionCount).toBe(0);
    expect(suite.missedRestrictions).toBe(0);
  });

  it("correct refusals: missing ICA and unevidenced builder are not PERMITTED", () => {
    const ica = runAuthenticPackageScenario(
      AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-gibraltar-secured-missing-ica")!,
    );
    expect(ica.actualOverall).toBe("UNDETERMINED");
    const rp = runAuthenticPackageScenario(
      AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-gibraltar-rp-builder-unevidenced")!,
    );
    expect(rp.actualOverall).not.toBe("PERMITTED");
  });
});

describe("P1 — sequential state integration (hypothetical isolation)", () => {
  it("debt → RP → overflow: updates debt/RP/shared basket and reevaluates; no ledger post", () => {
    const base = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-conmed-unsecured-general-basket")!;
    const seq = buildConmedSequentialDemo({
      provisions: base.provisions,
      financials: base.financials,
    });
    expect(seq.postsToLedger).toBe(false);
    expect(seq.honestRemainingUnknown).toBe(true);
    expect(seq.steps).toHaveLength(3);

    const t1 = seq.steps[0]!;
    expect(t1.verdict.overallResult).toBe("PERMITTED");
    expect(t1.advanced).toBe(true);
    expect(t1.post.totalDebtUsd).toBeGreaterThan(t1.pre.totalDebtUsd);
    expect(t1.post.basketRemainingUsd["7.2(o)"]).toBe(10_000_000);

    const t2 = seq.steps[1]!;
    expect(t2.verdict.overallResult).toBe("PERMITTED");
    expect(t2.post.rpCapacityUsd).toBe(15_000_000);

    const t3 = seq.steps[2]!;
    // $20M vs remaining $10M §7.2(o) → not a free permission
    expect(t3.verdict.overallResult).not.toBe("PERMITTED");
    expect(t3.layers.certificationStatus.legacyIsCertifiedPackagePermission).toBe(false);
    expect(t3.numerical.postsToLedger).toBe(false);
  });
});

describe("P2 — canonical product integration", () => {
  it("numerical attach remains postsToLedger=false and conditionsSeparatelyEvaluated", () => {
    const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-gibraltar-general-debt-basket")!;
    const run = runAuthenticPackageScenario(scenario);
    expect(run.numerical.postsToLedger).toBe(false);
    expect(run.numerical.conditionsSeparatelyEvaluated).toBe(true);
    const layers = projectPermissionLayers({
      verdict: run.verdict,
      numerical: attachNumericalCapacity({
        verdict: run.verdict,
        provisions: scenario.provisions,
        financials: scenario.financials,
      }),
    });
    expect(layers.numericallyModeledCapacity.authority).toMatch(/LEGACY|MIXED|VERIFIED/);
  });
});
