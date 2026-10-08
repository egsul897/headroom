/**
 * Phase 3 — remediation verification harness tests.
 * Does not mutate phase1-freeze oracle or implement production fixes.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyFreezeIntact } from "../../lib/evaluation/live-corpus-quality-gate/phase2-replay";
import {
  buildStableFindingRecords,
  getFindingByStableId,
  getFindingsByOriginalId,
  resolveFindingIdCollision,
} from "../../lib/evaluation/live-corpus-quality-gate/phase3-harness";
import {
  buildRemediationContracts,
  contractStatusRollup,
} from "../../lib/evaluation/live-corpus-quality-gate/phase3-contracts";
import {
  replaySharedCapStillBroken,
  replaySupRestatesOnCheckout,
  replayBuilderDualCite,
  replayXrefLowResolve,
} from "../../lib/evaluation/live-corpus-quality-gate/phase3-replay";
import { runFalsePermissionAdversarialControls } from "../../lib/evaluation/live-corpus-quality-gate/phase3-adversarial";
import {
  buildDatasetSplits,
  measureLegalSafetyMetrics,
} from "../../lib/evaluation/live-corpus-quality-gate/phase3-metrics";

describe("live corpus quality gate phase 3", () => {
  it("preserves Phase-1 freeze oracle bytes", () => {
    const { intact, meta } = verifyFreezeIntact();
    expect(intact).toBe(true);
    expect(meta.frozenEvaluationContentSha).toBe("cebec8ab3aaecd894b1903ac0b758828655a88df");
    const freezeDir = path.join(process.cwd(), "docs/live-corpus-quality-gate/phase1-freeze");
    expect(fs.existsSync(path.join(freezeDir, "01-findings.json"))).toBe(true);
  });

  it("resolves finding-ID collision in versioned harness with stable mapping to all 46", () => {
    const report = resolveFindingIdCollision();
    expect(report.harnessVersion).toBe("live-corpus-quality-gate.phase3-harness.v1");
    expect(report.freezeIntact).toBe(true);
    expect(report.originalListedCount).toBe(46);
    expect(report.originalUniqueFindingIds).toBe(45);
    expect(report.stableRecords).toHaveLength(46);
    expect(report.allIndividuallyAddressable).toBe(true);
    expect(report.mappingComplete).toBe(true);
    expect(report.collisionGroups.length).toBe(1);
    expect(report.collisionGroups[0]?.occurrences).toBe(2);
    expect(new Set(report.collisionGroups[0]?.stableFindingIds).size).toBe(2);

    const records = buildStableFindingRecords();
    const ids = records.map((r) => r.stableFindingId);
    expect(new Set(ids).size).toBe(46);
    // Collision pair individually addressable
    const collided = getFindingsByOriginalId(
      "gib-doc-a:exception_and_condition_recall:legally_verified:pass",
    );
    expect(collided).toHaveLength(2);
    expect(collided[0]!.stableFindingId).not.toBe(collided[1]!.stableFindingId);
    expect(getFindingByStableId(collided[0]!.stableFindingId)?.summary).toMatch(/7\.02|Permitted Lien/);
    expect(getFindingByStableId(collided[1]!.stableFindingId)?.summary).toMatch(/7\.08|leverage/);
  });

  it("defines remediation contracts with required status vocabulary", () => {
    const contracts = buildRemediationContracts();
    expect(contracts.length).toBeGreaterThanOrEqual(5);
    const allowed = new Set([
      "OPEN",
      "FIX_PROPOSED",
      "REPLAY_FAILED",
      "REPLAY_PASSED",
      "INDEPENDENTLY_ADJUDICATED",
      "CLOSED",
    ]);
    for (const c of contracts) {
      expect(allowed.has(c.status)).toBe(true);
      expect(c.frozenExpectedBehavior.length).toBeGreaterThan(0);
      expect(c.independentTestCommand.length).toBeGreaterThan(0);
      expect(c.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(c.regressionRisks.length).toBeGreaterThan(0);
      expect(c.originalFailingSha.length).toBeGreaterThan(10);
      expect(c.closedOnlyByIndependentAdjudication).toBe(true);
      expect(c.freezeEpochPreserved).toBe(true);
    }
    // Must not close solely from production self-report — no CLOSED without adjudication path
    const rollup = contractStatusRollup(contracts);
    expect(rollup.CLOSED).toBe(0);
    expect(rollup.OPEN).toBeGreaterThan(0); // builder + xref remain OPEN
    expect(
      contracts.some((c) => c.defectId === "LCQG-SUP-AMEND-RESTATES-MISSING" && c.status === "INDEPENDENTLY_ADJUDICATED"),
    ).toBe(true);
    expect(
      contracts.some(
        (c) =>
          c.defectId === "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP" &&
          c.status === "INDEPENDENTLY_ADJUDICATED" &&
          c.proposedFixSha === "83cde5b985b6bb480ac2500cccf894fe6e497f20",
      ),
    ).toBe(true);
    // Still must not CLOSED from labeling-only adjudication
    expect(contracts.find((c) => c.defectId === "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP")?.status).not.toBe("CLOSED");
  });

  it("independently replays SUP RESTATES fix on current tip without editing production code", () => {
    const replay = replaySupRestatesOnCheckout("current-eval", "HEAD");
    expect(replay.verdict).toBe("REPLAY_PASSED");
    expect(replay.observations.docBType).toBe("AMENDED_AND_RESTATED_AGREEMENT");
    expect((replay.observations.restatesCount as number) >= 1).toBe(true);
  });

  it("records independent shared_cap fix replay while leaving builder/xref OPEN", () => {
    const shared = replaySharedCapStillBroken();
    expect(shared.verdict).toBe("REPLAY_PASSED");
    expect(shared.candidateSha).toBe("83cde5b985b6bb480ac2500cccf894fe6e497f20");
    expect(shared.observations.fixtureSharedCapCount).toBeGreaterThanOrEqual(51);
    // Eval branch does not ship the production fix
    expect(shared.observations.evalCheckoutStillHasLegacyPattern).toBe(true);

    const builder = replayBuilderDualCite();
    expect(builder.verdict).toBe("OPEN_UNAVAILABLE");
    expect(builder.observations.definitionCites705ay).toBe(true);

    const xref = replayXrefLowResolve();
    expect(xref.verdict).toBe("OPEN_UNAVAILABLE");
  });

  it("runs false-permission adversarial controls with fail-closed vocabulary", () => {
    const { cases, summary } = runFalsePermissionAdversarialControls();
    expect(cases.length).toBeGreaterThanOrEqual(7);
    expect(summary.denominator).toBe(cases.length);
    expect(summary.failUnsafe + summary.passFailClosed + summary.unverified).toBe(summary.denominator);
    // Eval checkout still has legacy Pass A — ADV-FP-01 remains FAIL_UNSAFE locally.
    // Independent worktree replay of 83cde5b is recorded separately (28-p0 artifact).
    expect(cases.some((c) => c.caseId === "ADV-FP-01" && c.verdict === "FAIL_UNSAFE")).toBe(true);
    // Unresolved GT categories must not be PASS
    expect(cases.filter((c) => !c.groundTruthAvailable).every((c) => c.verdict === "UNVERIFIED")).toBe(
      true,
    );
  });

  it("separates dataset roles and never treats missing GT as PASS in metrics", () => {
    const splits = buildDatasetSplits();
    expect(splits.blind.some((b) => /knife|BLIND|blind/i.test(b))).toBe(true);
    const { metrics } = measureLegalSafetyMetrics();
    for (const m of metrics) {
      if (m.status === "UNVERIFIED") {
        expect(m.numerator === null || m.rate === null || m.uncertainty.length > 0).toBe(true);
      }
      // Explicit: unavailable GT metrics are not PASS
      if (m.numerator === null && m.denominator === null) {
        expect(m.status).toBe("UNVERIFIED");
      }
    }
    expect(metrics.some((m) => m.metricId === "false_affirmative_permission_rate" && m.status === "FAIL")).toBe(
      true,
    );
    expect(metrics.some((m) => m.metricId === "dangerous_omission_recall")).toBe(true);
  });
});
