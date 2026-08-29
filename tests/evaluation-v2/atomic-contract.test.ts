/**
 * Evaluation Contract V3 — adversarial suite for the atomic-trust-dimension
 * derivation layer (Section 22). Runs every case in atomic-contract-cases.ts
 * through the full deterministic engine (unchanged, frozen matcher) and
 * asserts the derived AtomicEvaluationContract. Also re-verifies all 14
 * historical false-credit controls resolve creditEligibility=NO_CREDIT under
 * the new contract, independent of and in addition to the existing
 * dsgr-false-credit-gate.test.ts (matchStatus-level) regression.
 */
import { describe, expect, it } from "vitest";

import { deriveAtomicContract } from "@/lib/contract-model/evaluation-v2/atomic-contract";
import { emptyOverlay } from "@/lib/contract-model/evaluation-v2/adjudication";
import { loadDsgrDataset } from "@/lib/contract-model/evaluation-v2/adapters/dsgr";
import { runEvaluationV2 } from "@/lib/contract-model/evaluation-v2/index";
import type { GroundTruthOverlay } from "@/lib/contract-model/evaluation-v2/adjudication";
import { ATOMIC_CONTRACT_CASES } from "./atomic-contract-cases";
import { candidate, gt, SYNTHETIC_DATASET } from "./synthetic-fixtures";

const FOURTEEN_FALSE_CREDIT_GT_UNIT_IDS = [
  "doc-a::VI::6.01-chapeau",
  "doc-a::VI::6.04-chapeau",
  "doc-a::VI::6.04-unrestricted-sub-valuation",
  "doc-a::VI::6.05-chapeau",
  "doc-a::VI::6.05-ip-flush-prohibition",
  "doc-a::VI::6.08b-chapeau",
  "doc-a::VI::6.10-chapeau",
  "doc-b::VI::6-01-lead-in",
  "doc-b::VI::6-04-lead-in",
  "doc-b::VI::6-05-lead-in",
  "doc-d::VI::6-01-chapeau",
  "doc-d::VI::6-04-chapeau",
  "doc-d::VI::6-05-chapeau",
  "doc-d::VI::6-08-b-chapeau",
];

describe("Evaluation Contract V3 — atomic trust dimension adversarial suite", () => {
  for (const testCase of ATOMIC_CONTRACT_CASES) {
    it(`${testCase.caseId}: ${testCase.description}`, async () => {
      let overlay: GroundTruthOverlay | null = null;
      if (testCase.overlayEntry) {
        overlay = emptyOverlay(SYNTHETIC_DATASET, "atomic-contract.test.ts", "2026-08-29T00:00:00Z");
        overlay.entries.push({ gtUnitId: testCase.gt.id, authoredBy: "atomic-contract.test.ts", authoredAt: "2026-08-29T00:00:00Z", ...testCase.overlayEntry });
      }

      const candidates = testCase.candidates.map(candidate);
      const result = await runEvaluationV2([gt(testCase.gt)], candidates, { datasetKey: SYNTHETIC_DATASET, overlay });
      const unit = result.units[0];
      expect(unit).toBeDefined();
      if (!unit) return;

      const candidatesById = new Map(candidates.map((c) => [c.candidateId, c]));
      const atomic = deriveAtomicContract(unit, candidatesById);

      const ctx = `${testCase.caseId}: matchStatus=${unit.matchStatus}; rationale=${atomic.rationale}`;
      expect(atomic.creditEligibility, ctx).toBe(testCase.expect.creditEligibility);
      if (testCase.expect.surfacingStatus) expect(atomic.surfacingStatus, ctx).toBe(testCase.expect.surfacingStatus);
      if (testCase.expect.representationCompleteness) expect(atomic.representationCompleteness, ctx).toBe(testCase.expect.representationCompleteness);
      if (testCase.expect.verificationStatus) expect(atomic.verificationStatus, ctx).toBe(testCase.expect.verificationStatus);
      if (testCase.expect.evidenceQuality) expect(atomic.evidenceQuality, ctx).toBe(testCase.expect.evidenceQuality);
      if (testCase.expect.dangerousSilentOmission !== undefined) expect(atomic.dangerousSilentOmission, ctx).toBe(testCase.expect.dangerousSilentOmission);
    });
  }

  it("covers at least the 16 required scenario categories (Section 22, items 1-16)", () => {
    expect(ATOMIC_CONTRACT_CASES.length).toBeGreaterThanOrEqual(16);
  });

  it("GATE (item 17): all 14 historical false-credit controls resolve creditEligibility=NO_CREDIT under the atomic contract", async () => {
    const dataset = loadDsgrDataset(process.cwd());
    const result = await runEvaluationV2(dataset.groundTruth, dataset.candidates, { datasetKey: "dsgr-2022-2025-credit-facility" });
    const candidatesById = new Map(dataset.candidates.map((c) => [c.candidateId, c]));
    const byId = new Map(result.units.map((u) => [u.gtUnitId, u]));

    expect(FOURTEEN_FALSE_CREDIT_GT_UNIT_IDS.length).toBe(14);
    for (const id of FOURTEEN_FALSE_CREDIT_GT_UNIT_IDS) {
      const unit = byId.get(id);
      expect(unit, `${id} not found in DSGR dataset`).toBeDefined();
      if (!unit) continue;
      const atomic = deriveAtomicContract(unit, candidatesById);
      expect(atomic.creditEligibility, `${id}: matchStatus=${unit.matchStatus}; ${atomic.rationale}`).toBe("NO_CREDIT");
    }
  }, 60_000);
});
