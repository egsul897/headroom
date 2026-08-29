/**
 * Evaluation Methodology V2 — Phase 3F.1.5.3 Workstream A adversarial suite
 * (enforcement). Runs every case in sibling-claim-cases.ts through the full
 * deterministic engine and asserts its expected disposition. Satisfies
 * Section 9's 20-scenario sibling/sub-provision adversarial test requirement.
 */
import { describe, expect, it } from "vitest";

import { runEvaluationV2 } from "@/lib/contract-model/evaluation-v2/index";
import type { MatchStatus } from "@/lib/contract-model/evaluation-v2/types";
import { SIBLING_CLAIM_CASES } from "./sibling-claim-cases";
import { candidate, gt, SYNTHETIC_DATASET } from "./synthetic-fixtures";

const CREDITED: MatchStatus[] = ["EXACT_SINGLE", "EXACT_COMPOSITE"];

describe("Evaluation V2 — sibling/sub-provision claim-identity suite", () => {
  for (const testCase of SIBLING_CLAIM_CASES) {
    it(`${testCase.caseId}: ${testCase.description}`, async () => {
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
      if (testCase.expectation.dangerousUnaccounted !== undefined) {
        expect(unit.dangerousUnaccountedV2, `${testCase.caseId} dangerousUnaccountedV2 (${unit.dangerousUnaccountedReason ?? "none"})`).toBe(testCase.expectation.dangerousUnaccounted);
      }
      if (testCase.expectation.explicitlySurfacedAsUnsafe !== undefined) {
        expect(unit.explicitlySurfacedAsUnsafe, `${testCase.caseId} explicitlySurfacedAsUnsafe`).toBe(testCase.expectation.explicitlySurfacedAsUnsafe);
      }
    });
  }

  it("covers at least the 20 required sibling/sub-provision scenarios (Section 9)", () => {
    expect(SIBLING_CLAIM_CASES.length).toBeGreaterThanOrEqual(20);
  });
});
