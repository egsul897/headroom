/**
 * Agent 5 next mission — authenticity, authentic packages, capacity, 4D, Ask, adversarial.
 * Preserves PR #218 synthetic regression suite (separate file).
 */
import { describe, expect, it } from "vitest";
import { AUTHENTIC_CROSS_DOCUMENT_SCENARIOS, runAllCrossDocumentScenarios } from "@/lib/product/covenant-intelligence/cross-document-scenarios";
import {
  AUTHENTIC_PACKAGE_SCENARIOS,
  runAllAuthenticPackageScenarios,
  runAuthenticPackageScenario,
} from "@/lib/product/covenant-intelligence/cross-document-authentic-packages";
import {
  ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS,
  runAdversarialScenario,
  runAllAdversarialScenarios,
} from "@/lib/product/covenant-intelligence/cross-document-adversarial";
import { attachNumericalCapacity } from "@/lib/product/covenant-intelligence/cross-document-capacity";
import { evaluateCrossDocumentTransaction } from "@/lib/product/covenant-intelligence/cross-document-covenant";
import { parseTransactionDraft, analyzeContemplatedTransaction } from "@/lib/product/north-star-workflow/transaction-analysis";
import { buildSimulateHandoffHref, simulateActionFromAskKind } from "@/lib/product/unified-position/simulate-handoff";
import {
  DEMO_EXERCISES,
  runFixtureCertifiedPath,
} from "@/lib/product/north-star-workflow";
import { readFileSync } from "node:fs";

describe("Priority 1 — authenticity audit of PR #218 scenarios", () => {
  it("labels all eight baseline scenarios as SYNTHETIC_PRODUCT_ACCEPTANCE", () => {
    expect(AUTHENTIC_CROSS_DOCUMENT_SCENARIOS).toHaveLength(8);
    for (const s of AUTHENTIC_CROSS_DOCUMENT_SCENARIOS) {
      expect(s.authenticity).toBe("SYNTHETIC_PRODUCT_ACCEPTANCE");
    }
  });

  it("synthetic fixture manifests declare synthetic issuers", () => {
    const b = JSON.parse(
      readFileSync("tests/fixtures/product-acceptance/packages/pkg-b-multi-document/expectations.json", "utf8"),
    );
    expect(String(b.issuer)).toMatch(/synthetic/i);
  });

  it("preserves PR #218 regression: 8/8 match, FP=0", () => {
    const suite = runAllCrossDocumentScenarios();
    expect(suite.matchedCount).toBe(8);
    expect(suite.falsePermissionCount).toBe(0);
  });
});

describe("Priority 2 — authentic EDGAR fixture packages", () => {
  it("registers authentic scenarios separately from synthetic", () => {
    expect(AUTHENTIC_PACKAGE_SCENARIOS.length).toBeGreaterThanOrEqual(5);
    for (const s of AUTHENTIC_PACKAGE_SCENARIOS) {
      expect(s.authenticity).toBe("AUTHENTIC_EDGAR_FIXTURE");
      for (const f of s.fixturePaths) {
        expect(() => readFileSync(f, "utf8")).not.toThrow();
      }
    }
  });

  for (const scenario of AUTHENTIC_PACKAGE_SCENARIOS) {
    it(`${scenario.scenarioId}: ${scenario.title}`, () => {
      // Expected result is declared on the scenario object before this call.
      expect(scenario.expectedOverall).toBe(scenario.independentGroundTruth.expectedOverall);
      const run = runAuthenticPackageScenario(scenario);
      expect(run.actualOverall, JSON.stringify({
        expected: run.expectedOverall,
        actual: run.actualOverall,
        prohibitions: run.verdict.prohibitions,
        permissions: run.verdict.supportedPermissions,
        unknowns: run.verdict.unknowns.slice(0, 8),
        docs: run.verdict.documentVerdicts.map((d) => ({
          id: d.documentId,
          app: d.applicability,
          result: d.documentResult,
        })),
      }, null, 2)).toBe(scenario.expectedOverall);
      expect(run.independentVerification.falsePermissionCount).toBe(0);
      expect(run.groundTruthCoverage.missedSectionRefs).toEqual([]);
      expect(run.verdict.exactSourceCitations.length).toBeGreaterThan(0);
    });
  }

  it("suite: authentic packages match + FP=0", () => {
    const suite = runAllAuthenticPackageScenarios();
    expect(suite.matchedCount).toBe(suite.total);
    expect(suite.falsePermissionCount).toBe(0);
    expect(suite.missedRestrictions).toBe(0);
  });
});

describe("Priority 3 — numerical capacity integration", () => {
  it("evaluates each applicable document/pathway capacity; most restrictive when modeled; conditions separate", () => {
    const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-conmed-unsecured-general-basket")!;
    const run = runAuthenticPackageScenario(scenario);
    expect(run.numerical.postsToLedger).toBe(false);
    expect(run.numerical.conditionsSeparatelyEvaluated).toBe(true);
    expect(run.numerical.pathwayCapacities.length).toBeGreaterThan(0);
    const o = run.numerical.pathwayCapacities.find((p) => p.sectionRef === "7.2(o)");
    expect(o?.status).toBe("modeled");
    expect(o?.capacityMillions).toBe(60);
    expect(o?.remainingVsAmount).toBe("SUFFICIENT");
    expect(run.numerical.documentSummaries.length).toBeGreaterThan(0);
    // Non-numeric qualitative paths preserved separately
    expect(run.numerical.note).toMatch(/not collapsed into a single MIN/i);
  });

  it("shared-capacity anti-stacking notes preserved on secured granite path", () => {
    const synth = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === "xd-03-debt-and-lien")!;
    const verdict = evaluateCrossDocumentTransaction({
      transaction: synth.transaction,
      provisions: synth.provisions,
      verifiedPackage: null,
    });
    const numerical = attachNumericalCapacity({
      verdict,
      provisions: synth.provisions,
      financials: {
        ebitda: 300,
        cash: 40,
        interestExpense: 30,
        cumulativeNetIncome: 100,
        equityProceedsSinceIssue: 0,
        assumedNewDebtRatePct: 7,
        totalDebt: 800,
        securedDebt: 500,
        totalAssets: 2000,
      },
    });
    expect(numerical.antiStackingNotes.length).toBeGreaterThan(0);
    expect(verdict.overallResult).toBe("PROHIBITED");
  });
});

describe("Priority 4 — Phase 4D transaction-state (no ledger post)", () => {
  it("runFixtureCertifiedPath simulates consumption in memory with postsToLedger false on capacity layer", () => {
    const exercise = DEMO_EXERCISES.find((e) => e.id === "secured-borrowing-100m")!;
    const certified = runFixtureCertifiedPath(exercise);
    expect(certified.blocked).toBe(false);
    expect(certified.capacity?.outcome === "EXECUTED" || certified.capacity?.outcome === "REFUSED").toBe(true);
    if (certified.simulation) {
      expect(["EXECUTED", "REFUSED"]).toContain(certified.simulation.outcome);
    }
    // Wire into numerical layer attachment
    const synth = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === "xd-02-different-conditions")!;
    const verdict = evaluateCrossDocumentTransaction({
      transaction: synth.transaction,
      provisions: synth.provisions,
      verifiedPackage: certified.package,
    });
    const numerical = attachNumericalCapacity({
      verdict,
      provisions: synth.provisions,
      financials: {
        ebitda: 400,
        cash: 50,
        interestExpense: 40,
        cumulativeNetIncome: 200,
        equityProceedsSinceIssue: 0,
        assumedNewDebtRatePct: 8,
        totalDebt: 1000,
        securedDebt: 700,
        totalAssets: 2500,
      },
      verifiedSimulationResult: certified.simulation,
    });
    expect(numerical.postsToLedger).toBe(false);
    expect(numerical.prePost?.note).toMatch(/postsToLedger=false|in memory/i);
  });
});

describe("Priority 5 — Position / Simulate / Ask identical inputs", () => {
  it("parseTransactionDraft → contemplated + simulateHref share amount/kind/secured/asOf", () => {
    const q = "Can we incur $50 million of unsecured debt on 2026-06-30?";
    const draft = parseTransactionDraft(q);
    expect(draft.amountMillions).toBe(50);
    expect(draft.kind).toBe("UNSECURED_DEBT");
    expect(draft.secured).toBe(false);
    expect(draft.evaluationDate).toBe("2026-06-30");
    const action = simulateActionFromAskKind(draft.kind);
    expect(action).toBe("debt");
    const href = buildSimulateHandoffHref("co-test", {
      action: action!,
      amountMillions: draft.amountMillions!,
      secured: draft.secured,
      evaluationDate: draft.evaluationDate,
      source: "ask",
    });
    expect(href).toContain("/co-test/simulate?");
    expect(href).toContain("amount=50");
    expect(href).toContain("secured=0");
    expect(href).toContain("asOf=2026-06-30");
  });

  it("analyzeContemplatedTransaction exposes crossDocumentVerdict with same draft fields", async () => {
    const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-conmed-unsecured-general-basket")!;
    const result = await analyzeContemplatedTransaction({
      companyId: "missing-company-for-offline-ask",
      question: "Can we incur $50 million of unsecured debt on 2026-06-30?",
      confirmed: true,
      verifiedPackage: null,
      crossDocumentProvisions: scenario.provisions,
    });
    expect(result.draft.amountMillions).toBe(50);
    expect(result.crossDocumentVerdict).not.toBeNull();
    expect(result.crossDocumentVerdict!.transaction.amountUsd).toBe(50_000_000);
    expect(result.crossDocumentVerdict!.transaction.asOfDate).toBe("2026-06-30");
    expect(result.crossDocumentVerdict!.overallResult).toBe("PERMITTED");
    expect(result.crossDocumentVerdict!.exactSourceCitations.length).toBeGreaterThan(0);
    expect(result.simulateHref).toContain("/simulate?");
    // legacy may refuse without financials — still consistent draft
    expect(result.legacySimulation == null || "refused" in result.legacySimulation || result.legacySimulation.authority === "LEGACY_ENGINE").toBe(true);
  });
});

describe("Priority 6 — adversarial correctness", () => {
  it("registers ten adversarial attacks with pre-declared expectations", () => {
    expect(ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS).toHaveLength(10);
    const attacks = new Set(ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS.map((s) => s.attack));
    expect(attacks.size).toBe(10);
  });

  for (const scenario of ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS) {
    it(`${scenario.scenarioId}: ${scenario.attack}`, () => {
      const run = runAdversarialScenario(scenario);
      expect(run.falsePermission, JSON.stringify({
        id: run.scenarioId,
        expected: run.expectedOverall,
        actual: run.actualOverall,
        fp: run.independentVerification,
        prohibitions: run.verdict.prohibitions,
        unknowns: run.verdict.unknowns.slice(0, 6),
      }, null, 2)).toBe(false);
      expect(run.matchesExpected, JSON.stringify({
        expected: run.expectedOverall,
        actual: run.actualOverall,
        docs: run.verdict.documentVerdicts.map((d) => ({ id: d.documentId, app: d.applicability, result: d.documentResult })),
      }, null, 2)).toBe(true);
    });
  }

  it("suite adversarial FP=0", () => {
    const suite = runAllAdversarialScenarios();
    expect(suite.falsePermissionCount).toBe(0);
    expect(suite.matchedCount).toBe(suite.total);
  });
});
