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
  type GroundTruthProvenance,
} from "@/lib/verification-factory";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

describe("CVF harness — reuse existing engines", () => {
  it("PR_FAST run: zero incorrect favorable; production/cert gates flagged unchanged", () => {
    const report = runHarness({ tier: "PR_FAST" });
    expect(report.productionSemanticsUnchanged).toBe(true);
    expect(report.certificationGatesUnchanged).toBe(true);
    expect(report.metrics.totalExecutions).toBeGreaterThanOrEqual(30);
    expect(report.metrics.incorrectFavorable).toBe(0);
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
    expect(d.fixtureClasses.PUBLIC_DEVELOPMENT + d.fixtureClasses.FROZEN_REGRESSION).toBeGreaterThan(20);
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

  it("public registry includes sealed holdout metadata without executable expectation", () => {
    const holdouts = listPublicRegistryCases().filter((c) => c.fixtureClass === "BLIND_AUTHENTIC_HOLDOUT");
    expect(holdouts.length).toBeGreaterThanOrEqual(1);
    expect("holdoutSealId" in holdouts[0]!.provenance).toBe(true);
  });
});
