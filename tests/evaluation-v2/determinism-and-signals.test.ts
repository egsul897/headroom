/**
 * Evaluation Methodology V2 — determinism and Layer-1 signal unit tests.
 *
 * Phase 3F.1.5. Architecture invariant #21: re-running identical inputs must
 * produce identical output. These tests are the fast, always-on version of the
 * reproducibility runner, plus direct coverage of the deterministic primitives
 * whose correctness the whole evaluator rests on.
 */
import { describe, expect, it } from "vitest";

import { contentHash } from "@/lib/contract-model/evaluation-v2/identity";
import { runEvaluationV2 } from "@/lib/contract-model/evaluation-v2/index";
import {
  classifyFamily,
  extractAmounts,
  extractComparisonDirections,
  extractCapStructure,
  extractConditions,
  extractInstruments,
  extractPercentages,
  extractPosture,
  extractProvisionBreadth,
  extractRatios,
  extractScope,
  figuresEquivalent,
  overlapDetail,
  postureClass,
} from "@/lib/contract-model/evaluation-v2/signals";
import { ADVERSARIAL_CASES } from "./adversarial-cases";
import { candidate, gt, SYNTHETIC_DATASET } from "./synthetic-fixtures";

describe("Evaluation V2 — determinism", () => {
  it("produces byte-identical dispositions across two runs over identical inputs", async () => {
    const groundTruth = ADVERSARIAL_CASES.map((c) => gt(c.gt));
    const candidates = ADVERSARIAL_CASES.flatMap((c) => c.candidates.map(candidate));

    const first = await runEvaluationV2(groundTruth, candidates, { datasetKey: SYNTHETIC_DATASET });
    const second = await runEvaluationV2(groundTruth, candidates, { datasetKey: SYNTHETIC_DATASET });

    const fingerprint = (result: typeof first) =>
      contentHash(
        result.units.map((u) => ({
          gtUnitId: u.gtUnitId,
          matchStatus: u.matchStatus,
          representationStatus: u.representationStatus,
          semanticCorrectness: u.semanticCorrectness,
          dangerousUnaccountedV2: u.dangerousUnaccountedV2,
          matchedCandidateIds: u.matchedCandidateIds,
        })),
      );

    expect(fingerprint(first)).toBe(fingerprint(second));
    expect(contentHash(first.metrics)).toBe(contentHash(second.metrics));
    expect(first.runIdentity).toBe(second.runIdentity);
  });

  it("orders units deterministically regardless of input order", async () => {
    const groundTruth = ADVERSARIAL_CASES.map((c) => gt(c.gt));
    const candidates = ADVERSARIAL_CASES.flatMap((c) => c.candidates.map(candidate));
    const forward = await runEvaluationV2(groundTruth, candidates, { datasetKey: SYNTHETIC_DATASET });
    const reversed = await runEvaluationV2([...groundTruth].reverse(), [...candidates].reverse(), { datasetKey: SYNTHETIC_DATASET });
    expect(forward.units.map((u) => u.gtUnitId)).toEqual(reversed.units.map((u) => u.gtUnitId));
  });
});

describe("Evaluation V2 — Layer 1 signal primitives", () => {
  it("reads money amounts with currency and scale", () => {
    expect(extractAmounts("not to exceed $35,000,000").map((f) => f.value)).toContain(35_000_000);
    expect(extractAmounts("up to $50 million").map((f) => f.value)).toContain(50_000_000);
    expect(extractAmounts("C$10,000,000").map((f) => f.currency)).toContain("CAD");
  });

  it("reads a percentage together with the metric it is taken of", () => {
    const ebitda = extractPercentages("12.5% of Consolidated EBITDA");
    const assets = extractPercentages("12.5% of Consolidated Total Assets");
    expect(ebitda[0]?.basis).toBe("EBITDA");
    expect(assets[0]?.basis).toBe("TOTAL_ASSETS");
    expect(figuresEquivalent(ebitda[0]!, assets[0]!)).toBe(false);
  });

  it("reads a ratio together with the test it applies to", () => {
    const leverage = extractRatios("Total Net Leverage Ratio ... to exceed 4.00 to 1.00");
    const fccr = extractRatios("Fixed Charge Coverage Ratio ... to be less than 4.00 to 1.00");
    expect(leverage[0]?.basis).toBe("TOTAL_NET_LEVERAGE_RATIO");
    expect(fccr[0]?.basis).toBe("FIXED_CHARGE_COVERAGE_RATIO");
    expect(figuresEquivalent(leverage[0]!, fccr[0]!)).toBe(false);
  });

  it("distinguishes a greater-of cap from a single figure", () => {
    expect(extractCapStructure("the greater of $50,000,000 and 10% of Consolidated EBITDA")).toBe("GREATER_OF");
    expect(extractCapStructure("not to exceed $50,000,000")).toBe("SINGLE");
  });

  it("distinguishes comparison direction", () => {
    expect(extractComparisonDirections("shall not exceed 4.00 to 1.00")).toContain("NOT_EXCEED");
    expect(extractComparisonDirections("shall not be less than 3.00 to 1.00")).toContain("AT_LEAST");
  });

  it("does not record an excluded entity class as an included scope", () => {
    const scope = extractScope("Indebtedness of Restricted Subsidiaries that are not Loan Parties");
    expect(scope).toContain("NON_LOAN_PARTY_SUBSIDIARY");
    expect(scope).not.toContain("LOAN_PARTY");
  });

  it("separates secured from unsecured", () => {
    expect(extractInstruments("unsecured Indebtedness")).toContain("UNSECURED");
    expect(extractInstruments("unsecured Indebtedness")).not.toContain("SECURED");
    expect(extractInstruments("secured Indebtedness")).toContain("SECURED");
  });

  it("treats a no-Default gate inside a basket as a CONDITION signal, not as an Event of Default clause", () => {
    const text = "(iii) the Company may make Restricted Payments so long as no Default or Event of Default shall exist.";
    expect(extractConditions(text)).toContain("NO_DEFAULT");
    expect(extractPosture(text)).not.toBe("EVENT_OF_DEFAULT");
  });

  it("classifies deontic direction so voice does not create a false inversion", () => {
    expect(postureClass("PROHIBITION")).toBe("RESTRICTIVE");
    expect(postureClass("OBLIGATION")).toBe("RESTRICTIVE");
    expect(postureClass("PERMISSION")).toBe("PERMISSIVE");
  });

  it("reads provision breadth from drafting shape", () => {
    const chapeau = "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except as permitted by clauses (a) through (q).";
    const basket = "(c) Indebtedness incurred to finance the acquisition of fixed assets, in an aggregate principal amount not to exceed $8,000,000.";
    expect(extractProvisionBreadth({ text: chapeau, declaredType: "COVENANT" })).toBe("UNIVERSAL_RESTRICTION");
    expect(extractProvisionBreadth({ text: basket, declaredType: "BASKET" })).toBe("NARROW_CARVEOUT");
  });

  it("classifies covenant family from the provision's own words", () => {
    expect(classifyFamily("create, incur or assume any Indebtedness")).toBe("INDEBTEDNESS");
    expect(classifyFamily("permit the Total Net Leverage Ratio to exceed 4.00 to 1.00")).toBe("FINANCIAL_COVENANTS");
  });

  it("measures vocabulary overlap with both a coefficient and an absolute shared-term floor", () => {
    const detail = overlapDetail(["indebtedness", "restricted", "subsidiary", "aggregate", "principal"], ["indebtedness", "restricted", "subsidiary"]);
    expect(detail.coefficient).toBe(1);
    expect(detail.sharedCount).toBe(3);
    const thin = overlapDetail(["indebtedness", "restricted", "subsidiary", "aggregate", "principal"], ["indebtedness", "quarterly"]);
    expect(thin.sharedCount).toBe(1);
  });
});
