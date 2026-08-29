/**
 * Evaluation Methodology V2 — the DSGR false-credit gate, as a permanent test.
 *
 * Phase 3F.1.5. Loads the frozen DSGR dataset and the frozen forensic record of
 * the 26 scorer-artifact-corrected cases, re-judges all 26 independently, and
 * asserts the phase gate: every one of the 14 previously-confirmed false
 * credits must be REJECTED or referred for review — none may be silently
 * upheld.
 *
 * Historical artifacts are read only; nothing here writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { loadDsgrDataset } from "@/lib/contract-model/evaluation-v2/adapters/dsgr";
import { evaluateFalseCreditGate, reconcileKnownFalseCredits } from "@/lib/contract-model/evaluation-v2/reconciliation";
import type { BridgeCase, FalseCreditReconciliationCase, HistoricalScorerRow } from "@/lib/contract-model/evaluation-v2/reconciliation";

const ROOT = process.cwd();
const BRIDGE_PATH = "tests/fixtures/unseen-packages/phase-3f1-1-forensics/phase-3f1-1-scorer-bridge.json";
const CORRECTED_ROWS_PATH = "tests/fixtures/unseen-packages/phase-3f1-1-forensics/raw-scorer-combination-C-corrected-x-firstblind.json";

interface Bridge {
  adversarialAudit: { falseCreditSuspectIds: string[]; falseCreditSuspectCount: number };
  perCaseBridge: BridgeCase[];
}

describe("Evaluation V2 — DSGR known-false-credit gate", () => {
  let cases: FalseCreditReconciliationCase[] = [];
  let bridge: Bridge;

  beforeAll(() => {
    bridge = JSON.parse(readFileSync(join(ROOT, BRIDGE_PATH), "utf-8")) as Bridge;
    const correctedRows = JSON.parse(readFileSync(join(ROOT, CORRECTED_ROWS_PATH), "utf-8")) as HistoricalScorerRow[];
    const dataset = loadDsgrDataset(ROOT);
    cases = reconcileKnownFalseCredits({
      groundTruth: dataset.groundTruth,
      candidates: dataset.candidates,
      bridgeCases: bridge.perCaseBridge,
      correctedScorerRows: correctedRows,
    });
  }, 300_000);

  it("re-judges all 26 scorer-artifact-corrected cases", () => {
    expect(bridge.perCaseBridge.length).toBe(26);
    expect(cases.length).toBe(26);
  });

  it("GATE: every one of the 14 previously-confirmed false credits is rejected or flagged, none silently upheld", () => {
    const gate = evaluateFalseCreditGate(cases);
    expect(gate.confirmedSuspectCount).toBe(bridge.adversarialAudit.falseCreditSuspectCount);
    expect(gate.silentlyUpheld, `silently upheld: ${gate.silentlyUpheld.join(", ")}`).toEqual([]);
    expect(gate.passed).toBe(true);
  });

  it("does not blanket-reject: it re-judges each case on its own evidence", () => {
    // The gate would be trivially satisfiable by rejecting all 26. The bridge
    // itself records 12 of the 26 as plausibly genuine, so a V2 that rejects
    // literally everything is reporting a different failure, not a success.
    const verdicts = new Set(cases.map((c) => c.verdict));
    expect(verdicts.size).toBeGreaterThan(1);
  });

  it("records, for every case, the ground-truth excerpt and the candidate excerpt(s) that carried the old credit", () => {
    for (const c of cases) {
      expect(c.groundTruthSemanticDescription.length).toBeGreaterThan(0);
      expect(c.oldCreditReason.length).toBeGreaterThan(0);
      expect(c.verdictRationale.length).toBeGreaterThan(0);
      for (const j of c.v2JudgmentsOfOldCreditPath) {
        expect(j.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
