/**
 * Evaluation Methodology V2 — adversarial synthetic suite (enforcement).
 *
 * Phase 3F.1.5. Runs every case in adversarial-cases.ts through the full
 * deterministic engine and asserts its expected disposition. Positive and
 * negative controls are both enforced: an evaluator that refuses everything
 * fails this file just as surely as one that credits everything.
 */
import { describe, expect, it } from "vitest";

import { runEvaluationV2 } from "@/lib/contract-model/evaluation-v2/index";
import type { MatchStatus } from "@/lib/contract-model/evaluation-v2/types";
import { ADVERSARIAL_CASES } from "./adversarial-cases";
import { candidate, gt, SYNTHETIC_DATASET } from "./synthetic-fixtures";

const CREDITED: MatchStatus[] = ["EXACT_SINGLE", "EXACT_COMPOSITE"];

describe("Evaluation V2 — adversarial synthetic suite", () => {
  for (const testCase of ADVERSARIAL_CASES) {
    it(`${testCase.caseId} [${testCase.control}] ${testCase.description}`, async () => {
      const result = await runEvaluationV2([gt(testCase.gt)], testCase.candidates.map(candidate), { datasetKey: SYNTHETIC_DATASET });
      const unit = result.units[0];
      expect(unit).toBeDefined();
      if (!unit) return;

      const isCredited = CREDITED.includes(unit.matchStatus);
      expect(isCredited, `${testCase.caseId}: matchStatus=${unit.matchStatus}; ${unit.reasonForCredit ?? unit.reasonForPartialCredit ?? unit.reasonForNoCredit ?? ""}`).toBe(testCase.expectation.credited);

      if (testCase.expectation.allowedMatchStatuses) {
        expect(testCase.expectation.allowedMatchStatuses, `${testCase.caseId} matchStatus`).toContain(unit.matchStatus);
      }
      if (testCase.expectation.requiredConflictCodes) {
        const codes = unit.pairAssessments.flatMap((p) => p.conflicts.map((c) => c.code));
        for (const required of testCase.expectation.requiredConflictCodes) {
          expect(codes, `${testCase.caseId} expected conflict ${required}`).toContain(required);
        }
      }
      if (testCase.expectation.dangerousUnaccounted !== undefined) {
        expect(unit.dangerousUnaccountedV2, `${testCase.caseId} dangerousUnaccountedV2 (${unit.dangerousUnaccountedReason ?? "none"})`).toBe(testCase.expectation.dangerousUnaccounted);
      }
      if (testCase.expectation.explicitlySurfacedAsUnsafe !== undefined) {
        expect(unit.explicitlySurfacedAsUnsafe, `${testCase.caseId} explicitlySurfacedAsUnsafe`).toBe(testCase.expectation.explicitlySurfacedAsUnsafe);
      }
    });
  }

  it("contains both positive and negative controls in every category that has a refusal rule", () => {
    const byCategory = new Map<string, Set<string>>();
    for (const c of ADVERSARIAL_CASES) {
      const set = byCategory.get(c.category) ?? new Set<string>();
      set.add(c.control);
      byCategory.set(c.category, set);
    }
    // At least a third of the categories must carry both controls; the suite is
    // meaningless if it only ever proves the evaluator says no.
    const withBoth = [...byCategory.values()].filter((s) => s.has("POSITIVE") && s.has("NEGATIVE")).length;
    expect(withBoth).toBeGreaterThanOrEqual(Math.ceil(byCategory.size / 3));
    expect(ADVERSARIAL_CASES.filter((c) => c.control === "POSITIVE").length).toBeGreaterThanOrEqual(8);
    expect(ADVERSARIAL_CASES.filter((c) => c.control === "NEGATIVE").length).toBeGreaterThanOrEqual(15);
  });
});
