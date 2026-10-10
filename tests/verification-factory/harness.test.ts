import { describe, expect, it } from "vitest";
import {
  runHarness,
  listExecutableRegistryCases,
  listPublicRegistryCases,
  diversityReport,
  summarizeFirst1000Plan,
  CI_TIER_PLAN,
  validateGroundTruthProvenance,
  assertExpectationsFrozen,
  CVF_GROUND_TRUTH_CONTRACT_VERSION,
  makeHoldoutSeal,
  openHoldoutSeal,
  publicHoldoutView,
  holdoutUnlockEnabled,
  auditAdapterProductionBinding,
  computeCoverageDenominators,
  groundedExpansionCounts,
  isKnownStandingIncorrectFavorable,
  type GroundTruthProvenance,
} from "@/lib/verification-factory";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

describe("CVF harness — reuse existing engines", () => {
  it("PR_FAST run: no unexpected incorrect favorables; production/cert gates unchanged", () => {
    const report = runHarness({ tier: "PR_FAST" });
    expect(report.productionSemanticsUnchanged).toBe(true);
    expect(report.certificationGatesUnchanged).toBe(true);
    expect(report.metrics.totalExecutions).toBeGreaterThanOrEqual(30);
    const unexpected = report.results.filter(
      (r) => r.grade === "INCORRECT_FAVORABLE" && !isKnownStandingIncorrectFavorable(r.caseId),
    );
    expect(unexpected).toEqual([]);
    expect(report.metrics.denominators.casesWithIndependentGt).toBe(report.metrics.totalExecutions);
    expect(report.metrics.denominators.structureFamilies).toBeGreaterThan(5);
  });

  it("registry wraps authentic + synthetic + adversarial without cloning bodies", () => {
    const exec = listExecutableRegistryCases();
    const ids = new Set(exec.map((c) => c.caseId));
    expect(ids.has("auth-conmed-unsecured-general-basket")).toBe(true);
    expect(ids.has("xd-01-permit-vs-prohibit")).toBe(true);
    expect(ids.has("a8-01-status-floor-wired")).toBe(true);
    expect(ids.has("seq-conmed-debt-rp-overflow")).toBe(true);
    expect(ids.has("meta-add-restriction-no-improve")).toBe(true);
  });

  it("diversity report tracks packages and families, not mere counts", () => {
    const d = diversityReport();
    expect(d.packages.length).toBeGreaterThan(3);
    expect(d.structureFamilies.length).toBeGreaterThan(10);
    expect((d.fixtureClasses.PUBLIC_DEVELOPMENT ?? 0) + (d.fixtureClasses.FROZEN_REGRESSION ?? 0)).toBeGreaterThan(20);
  });

  it("first-1000 plan is combinatorial (~1000) and anti-clone", () => {
    const plan = summarizeFirst1000Plan();
    expect(plan.estimatedTotal).toBeGreaterThanOrEqual(900);
    expect(plan.estimatedTotal).toBeLessThanOrEqual(1200);
    expect(plan.antiInflation.some((a) => /not expand by copying/i.test(a))).toBe(true);
    expect(plan.requiresNewGtFamilies).toBeGreaterThan(0);
  });

  it("CI tier plan keeps providerCalls=0 and does not replace certified path", () => {
    expect(CI_TIER_PLAN.PR_FAST.providerCalls).toBe(0);
    expect(CI_TIER_PLAN.INTEGRATION_BATCH.note).toMatch(/certified/i);
    expect(CI_TIER_PLAN.PR_FAST.note).toMatch(/does not replace canonical-compiler/i);
  });
});

describe("CVF ground-truth provenance contract", () => {
  const base: GroundTruthProvenance = {
    contractVersion: CVF_GROUND_TRUTH_CONTRACT_VERSION,
    issuerId: "conmed",
    financingPackageId: "conmed-2025-credit-facility",
    sourceDocuments: [{ documentId: "vii", path: "tests/fixtures/x.txt", sha256: null }],
    operativeAsOf: "2026-06-30",
    relevantSections: ["7.2(o)"],
    relevantDefinitions: [],
    independentlyEnumeratedRestrictions: [
      { sectionRef: "7.2(o)", family: "DEBT", whyApplicable: "general basket" },
    ],
    expectedLegalOutcome: "PERMITTED",
    reviewerIdentity: "reviewer",
    reviewProvenance: "independent read",
    confidence: "HIGH",
    unresolvedAmbiguities: [],
    frozenAt: "2026-10-09T00:00:00.000Z",
    notDerivedFromEngine: true,
  };

  it("accepts complete provenance", () => {
    expect(validateGroundTruthProvenance(base).ok).toBe(true);
  });

  it("rejects engine-derived expectations", () => {
    const bad = { ...base, notDerivedFromEngine: false as unknown as true };
    expect(validateGroundTruthProvenance(bad).ok).toBe(false);
  });

  it("forbids silent rewrite of expected outcomes", () => {
    const next = { ...base, expectedLegalOutcome: "PROHIBITED" as const };
    expect(assertExpectationsFrozen({ previous: base, next }).ok).toBe(false);
    expect(
      assertExpectationsFrozen({
        previous: base,
        next,
        allowRewrite: { reason: "counsel correction", approver: "legal-ops" },
      }).ok,
    ).toBe(true);
  });
});

describe("CVF holdout isolation", () => {
  it("public view never exposes expected outcomes", () => {
    const payload = {
      holdoutSealId: "holdout-example-v1",
      expectedLegalOutcome: "PROHIBITED" as const,
      provenance: {
        contractVersion: CVF_GROUND_TRUTH_CONTRACT_VERSION,
        issuerId: "sealed",
        financingPackageId: "sealed-pkg",
        sourceDocuments: [{ documentId: "d", path: "x", sha256: "abc" }],
        operativeAsOf: "2026-01-01",
        relevantSections: ["1"],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          { sectionRef: "1", family: "DEBT", whyApplicable: "x" },
        ],
        expectedLegalOutcome: "PROHIBITED" as const,
        reviewerIdentity: "blind-reviewer",
        reviewProvenance: "two-party seal",
        confidence: "HIGH" as const,
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
        notDerivedFromEngine: true as const,
      },
    };
    const seal = makeHoldoutSeal(payload, "example-v1.json");
    const view = publicHoldoutView(seal);
    expect(view.expectedOutcomeVisible).toBe(false);
    expect(view.payloadSha256).toHaveLength(64);

    mkdirSync("tests/fixtures/verification-factory/holdouts-SEALED", { recursive: true });
    const abs = join("tests/fixtures/verification-factory/holdouts-SEALED", "example-v1.json");
    writeFileSync(abs, JSON.stringify(payload));

    const prev = process.env.HOLDOUT_UNLOCK;
    delete process.env.HOLDOUT_UNLOCK;
    expect(holdoutUnlockEnabled()).toBe(false);
    expect(() => openHoldoutSeal(seal)).toThrow(/HOLDOUT_UNLOCK/);

    process.env.HOLDOUT_UNLOCK = "1";
    const opened = openHoldoutSeal(seal);
    expect(opened.expectedLegalOutcome).toBe("PROHIBITED");
    if (prev === undefined) delete process.env.HOLDOUT_UNLOCK;
    else process.env.HOLDOUT_UNLOCK = prev;
    try {
      unlinkSync(abs);
    } catch {
      /* keep if wanted */
    }
  });

  it("in-repo sealed example is FROZEN_REGRESSION, not BLIND_AUTHENTIC_HOLDOUT", () => {
    const sealed = listPublicRegistryCases().filter((c) => "holdoutSealId" in c.provenance);
    expect(sealed.length).toBeGreaterThanOrEqual(1);
    for (const h of sealed) {
      expect(h.fixtureClass).toBe("FROZEN_REGRESSION");
      expect(h.fixtureClass).not.toBe("BLIND_AUTHENTIC_HOLDOUT");
      if ("holdoutSealId" in h.provenance) {
        expect(h.provenance.fixtureClass).toBe("FROZEN_REGRESSION");
      }
    }
    // Sealed cases are not executable
    const execIds = new Set(listExecutableRegistryCases().map((c) => c.caseId));
    expect(execIds.has("holdout-example-sealed")).toBe(false);
  });
});

describe("CVF Cycle 2 — adapter binding, coverage, grounded expansion", () => {
  it("adapters import production engines and do not redefine evaluators", () => {
    const audit = auditAdapterProductionBinding();
    expect(audit.missingImports).toEqual([]);
    expect(audit.forbiddenHits).toEqual([]);
    expect(audit.ok).toBe(true);
    expect(audit.adaptersChecked).toContain("cross-document.ts");
    expect(audit.adaptersChecked).toContain("grounded-boundary.ts");
  });

  it("coverage denominators separate unique scenarios from executions", () => {
    const report = runHarness({ tier: "PR_FAST" });
    const cov = computeCoverageDenominators({
      cases: listPublicRegistryCases(),
      results: report.results,
    });
    expect(cov.uniqueLegalScenarios).toBeGreaterThanOrEqual(50);
    expect(cov.generatedExecutions).toBe(report.results.length);
    expect(Object.keys(cov.byLegalMechanic).length).toBeGreaterThan(3);
    expect(Object.keys(cov.byIssuer).length).toBeGreaterThan(3);
    expect(Object.keys(cov.byOutcomeClass).length).toBeGreaterThan(2);
    expect(cov.note).toMatch(/uniqueLegalScenarios/);
  });

  it("grounded expansion moves unique scenarios toward 100 with source-backed GT", () => {
    const counts = groundedExpansionCounts();
    expect(counts.boundaries).toBeGreaterThanOrEqual(25);
    expect(counts.productAcceptance).toBe(14);
    expect(counts.defectDetectors).toBeGreaterThanOrEqual(6);
    expect(counts.total).toBeGreaterThanOrEqual(50);

    const exec = listExecutableRegistryCases();
    expect(exec.length).toBeGreaterThanOrEqual(90);
    expect(listPublicRegistryCases().length).toBeGreaterThanOrEqual(100);

    const grounded = exec.filter((c) => c.tags.includes("grounded-expansion") || c.tags.includes("defect-detector"));
    for (const c of grounded.slice(0, 5)) {
      if ("holdoutSealId" in c.provenance) continue;
      expect(c.provenance.notDerivedFromEngine).toBe(true);
      expect(c.provenance.reviewerIdentity.length).toBeGreaterThan(0);
      expect(c.provenance.sourceDocuments.length).toBeGreaterThan(0);
      expect(c.provenance.operativeAsOf.length).toBeGreaterThan(0);
    }
  });

  it("explicit defect detectors are registered for false favorables, refusals, evidence, stale state", () => {
    const ids = new Set(listExecutableRegistryCases().map((c) => c.caseId));
    expect(ids.has("def-incorrect-favorable-guard")).toBe(true);
    expect(ids.has("def-incorrect-refusal-guard")).toBe(true);
    expect(ids.has("def-missing-evidence-ica")).toBe(true);
    expect(ids.has("def-stale-financial-sequential")).toBe(true);
    expect(ids.has("def-missed-restriction-completeness")).toBe(true);
    expect(ids.has("def-cross-doc-conjunction")).toBe(true);
  });

  it("defect detectors and grounded boundaries execute without incorrect favorables", () => {
    const report = runHarness({
      tier: "PR_FAST",
      caseIds: [
        "def-incorrect-favorable-guard",
        "def-incorrect-refusal-guard",
        "def-missing-evidence-ica",
        "def-stale-financial-sequential",
        "def-cross-doc-conjunction",
        "def-amendment-precedence",
        "gnd-conmed-72o-at-60m",
        "gnd-fwrg-601j-at-30m",
        "gnd-gib-secured-ica-absent",
      ],
    });
    expect(report.metrics.incorrectFavorable).toBe(0);
    expect(report.results.every((r) => r.grade !== "ERROR")).toBe(true);
  });
});
