/**
 * Evaluation Methodology V2 — Phase 3F.1.5.2 safe-surfacing + definitional-match
 * calibration suite (enforcement).
 *
 * Runs every case in safe-surfacing-calibration-cases.ts through the full
 * deterministic engine and asserts its expected disposition. Satisfies
 * Section 10 (>=10 definitional-match adversarial tests) and Section 16
 * (>=16 safe-surfacing adversarial tests) of the Phase 3F.1.5.2 charter.
 */
import { describe, expect, it } from "vitest";

import { runEvaluationV2 } from "@/lib/contract-model/evaluation-v2/index";
import type { MatchStatus } from "@/lib/contract-model/evaluation-v2/types";
import { SAFE_SURFACING_CASES } from "./safe-surfacing-calibration-cases";
import { candidate, gt, SYNTHETIC_DATASET } from "./synthetic-fixtures";

const CREDITED: MatchStatus[] = ["EXACT_SINGLE", "EXACT_COMPOSITE"];

describe("Evaluation V2 — safe-surfacing + definitional-match calibration suite", () => {
  for (const testCase of SAFE_SURFACING_CASES) {
    it(`${testCase.caseId} [${testCase.category}] ${testCase.description}`, async () => {
      const result = await runEvaluationV2([gt(testCase.gt)], testCase.candidates.map(candidate), { datasetKey: SYNTHETIC_DATASET });
      const unit = result.units[0];
      expect(unit).toBeDefined();
      if (!unit) return;

      const isCredited = CREDITED.includes(unit.matchStatus);
      expect(isCredited, `${testCase.caseId}: matchStatus=${unit.matchStatus}; ${unit.reasonForCredit ?? unit.reasonForPartialCredit ?? unit.reasonForNoCredit ?? ""}`).toBe(
        testCase.expectation.credited,
      );

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
        expect(unit.dangerousUnaccountedV2, `${testCase.caseId} dangerousUnaccountedV2 (${unit.dangerousUnaccountedReason ?? "none"})`).toBe(
          testCase.expectation.dangerousUnaccounted,
        );
      }
      if (testCase.expectation.explicitlySurfacedAsUnsafe !== undefined) {
        expect(unit.explicitlySurfacedAsUnsafe, `${testCase.caseId} explicitlySurfacedAsUnsafe`).toBe(testCase.expectation.explicitlySurfacedAsUnsafe);
      }
    });
  }

  it("covers at least 10 definitional-match cases (Section 10) and 16 safe-surfacing cases (Section 16)", () => {
    const definitional = SAFE_SURFACING_CASES.filter((c) => c.category === "DEFINITIONAL_MATCH").length;
    const safeSurfacing = SAFE_SURFACING_CASES.filter((c) => c.category === "SAFE_SURFACING").length;
    expect(definitional).toBeGreaterThanOrEqual(10);
    expect(safeSurfacing).toBeGreaterThanOrEqual(16);
  });
});
