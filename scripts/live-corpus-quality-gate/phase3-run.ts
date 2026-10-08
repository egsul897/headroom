#!/usr/bin/env tsx
/**
 * Live Corpus Quality Gate — Phase 3
 * Independent remediation verification.
 *
 * Does not modify phase1-freeze oracle, Claude-owned fixtures, production
 * legal rules, or certification status. No paid inference. No merges.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { verifyFreezeIntact, runIndependentReplay } from "../../lib/evaluation/live-corpus-quality-gate/phase2-replay";
import { resolveFindingIdCollision } from "../../lib/evaluation/live-corpus-quality-gate/phase3-harness";
import {
  buildRemediationContracts,
  contractStatusRollup,
} from "../../lib/evaluation/live-corpus-quality-gate/phase3-contracts";
import { runAllPriorityReplays } from "../../lib/evaluation/live-corpus-quality-gate/phase3-replay";
import { measureLegalSafetyMetrics } from "../../lib/evaluation/live-corpus-quality-gate/phase3-metrics";

function git(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function main() {
  const outDir = path.join(process.cwd(), "docs/live-corpus-quality-gate/phase3");
  fs.mkdirSync(outDir, { recursive: true });

  const freeze = verifyFreezeIntact();
  const phase1Replay = runIndependentReplay();
  const harness = resolveFindingIdCollision();
  const contracts = buildRemediationContracts();
  const archWt = fs.existsSync("/tmp/lcqg-phase3-worktrees/arch-remed")
    ? "/tmp/lcqg-phase3-worktrees/arch-remed"
    : null;
  const preWt = fs.existsSync("/tmp/lcqg-phase3-worktrees/pre-whitespace")
    ? "/tmp/lcqg-phase3-worktrees/pre-whitespace"
    : null;
  const { results: replayResults } = runAllPriorityReplays({
    archRemedWorktree: archWt,
    preWhitespaceWorktree: preWt,
  });
  const metricsBundle = measureLegalSafetyMetrics();
  const statusRollup = contractStatusRollup(contracts);

  const headSha = git("git rev-parse HEAD");
  const branch = git("git rev-parse --abbrev-ref HEAD");

  const artifacts = {
    "20-freeze-preservation.json": {
      freezeIntact: freeze.intact,
      frozenEvaluationContentSha: freeze.meta.frozenEvaluationContentSha,
      phase1TipSha: freeze.meta.phase1TipSha,
      artifactHashes: freeze.hashes,
      immutable: true,
      phase3DidNotMutateFreeze: true,
    },
    "21-stable-finding-ids.json": harness,
    "22-remediation-contracts.json": {
      contracts,
      statusRollup,
      note: "Statuses assigned by independent evaluation — not by production agent self-report.",
    },
    "23-fix-replays.json": {
      results: replayResults,
      prioritized: [
        "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
        "LCQG-SUP-AMEND-RESTATES-MISSING",
        "LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT",
        "LCQG-GIB-STRUCT-AMBIGUOUS-TOC",
        "LCQG-GIB-XREF-LOW-RESOLVE",
      ],
    },
    "24-false-permission-adversarial.json": metricsBundle.adversarial,
    "25-dataset-splits.json": metricsBundle.datasetSplits,
    "26-legal-safety-metrics.json": {
      metrics: metricsBundle.metrics,
      newlyEvaluatedAuthenticDocuments: metricsBundle.newlyEvaluatedAuthenticDocuments,
      remainingUnverified: metricsBundle.remainingUnverified,
    },
    "27-phase3-report.json": null as unknown,
  };

  const closed = contracts.filter((c) => c.status === "CLOSED").map((c) => c.defectId);
  const open = contracts.filter((c) => c.status === "OPEN").map((c) => c.defectId);
  const replayPassed = contracts.filter((c) => c.status === "REPLAY_PASSED").map((c) => c.defectId);
  const independentlyAdjudicated = contracts
    .filter((c) => c.status === "INDEPENDENTLY_ADJUDICATED")
    .map((c) => c.defectId);
  const regressed = contracts.filter((c) => c.status === "REPLAY_FAILED").map((c) => c.defectId);

  const report = {
    schemaVersion: "live-corpus-quality-gate.phase3.v1",
    generatedAt: new Date().toISOString(),
    headSha,
    branch,
    startingPr: 153,
    startingSha: "18e2ed4bd66eaa9caff25eac49ef490c2fbb1816",
    frozenEvaluationContentSha: "cebec8ab3aaecd894b1903ac0b758828655a88df",
    paidCalls: 0,
    certificationImpact: "NONE",
    claudeOwnedFixturesModified: false,
    productionLegalRulesModified: false,
    productionFixesImplemented: false,
    mergesPerformed: false,
    oracleUntouched: phase1Replay.oracleUntouched,
    freezeIntact: freeze.intact,
    mandatoryReturn: {
      "1_originalFindingsPreserved": {
        freezeIntact: freeze.intact,
        frozenFindingCount: phase1Replay.frozenFindingCount,
        frozenUniqueFindingIds: phase1Replay.frozenUniqueFindingIds,
        phase1ReplayReproducedUnique: phase1Replay.reproduced,
        freezeEvaluationContentSha: "cebec8ab3aaecd894b1903ac0b758828655a88df",
      },
      "2_findingIdCollisionResolvedInVersionedHarness": {
        harnessVersion: harness.harnessVersion,
        originalListed: harness.originalListedCount,
        originalUnique: harness.originalUniqueFindingIds,
        stableCount: harness.stableRecords.length,
        allIndividuallyAddressable: harness.allIndividuallyAddressable,
        collisionGroups: harness.collisionGroups,
        freezeUntouched: harness.freezeIntact,
      },
      "3_productionFixesReceivedAndIndependentlyReplayed": replayResults.map((r) => ({
        defectId: r.defectId,
        candidateSha: r.candidateSha,
        verdict: r.verdict,
        note: r.note,
      })),
      "4_defectsClosedOpenOrRegressed": {
        CLOSED: closed,
        OPEN: open,
        REPLAY_PASSED: replayPassed,
        INDEPENDENTLY_ADJUDICATED: independentlyAdjudicated,
        REPLAY_FAILED: regressed,
        statusRollup,
        note: "No defect CLOSED solely because a production agent reported passing tests.",
      },
      "5_falsePermissionAdversarialResults": metricsBundle.adversarial.summary,
      "6_newlyEvaluatedAuthenticDocuments": {
        count: metricsBundle.newlyEvaluatedAuthenticDocuments.length,
        documents: metricsBundle.newlyEvaluatedAuthenticDocuments,
        datasetSplits: metricsBundle.datasetSplits,
      },
      "7_independentLegalSafetyMetrics": metricsBundle.metrics,
      "8_remainingUnverifiedAreas": metricsBundle.remainingUnverified,
      "9_exactShaTestsCiPr": {
        headSha,
        branch,
        startingPr: 153,
        startingSha: "18e2ed4bd66eaa9caff25eac49ef490c2fbb1816",
        frozenEvaluationContentSha: "cebec8ab3aaecd894b1903ac0b758828655a88df",
        tests: [
          "npm run live-corpus-quality-gate:phase3",
          "npx vitest run tests/live-corpus-quality-gate/",
        ],
        ci: "GitHub Actions on PR #153 (draft)",
        prStatus: "draft — do not merge",
      },
    },
    gateVerdict: "LIVE_CORPUS_QUALITY_GATE_PHASE3_REMEDIATION_VERIFICATION_RECORDED",
  };

  artifacts["27-phase3-report.json"] = report;

  for (const [name, body] of Object.entries(artifacts)) {
    fs.writeFileSync(path.join(outDir, name), JSON.stringify(body, null, 2) + "\n");
  }

  const md = `# Live Corpus Quality Gate — Phase 3 Report

**Verdict:** \`LIVE_CORPUS_QUALITY_GATE_PHASE3_REMEDIATION_VERIFICATION_RECORDED\`

**Starting PR:** #153
**Starting SHA:** \`18e2ed4bd66eaa9caff25eac49ef490c2fbb1816\`
**Frozen evaluation content SHA:** \`cebec8ab3aaecd894b1903ac0b758828655a88df\`
**Generation HEAD:** \`${headSha}\`
**Paid calls:** \`0\`
**Certification impact:** \`NONE\`
**Production fixes in this branch:** \`false\`
**Phase-1 oracle untouched:** \`${freeze.intact}\`
**Merges:** \`false\`

## 1. Original findings preserved

- Freeze intact: **${freeze.intact}**
- Frozen findings: **${phase1Replay.frozenFindingCount}** listed / **${phase1Replay.frozenUniqueFindingIds}** unique
- Phase-1 unique IDs still reproducible: **${phase1Replay.reproduced}**

## 2. Finding-ID collision resolved (versioned harness)

- Harness: \`${harness.harnessVersion}\`
- Stable IDs: **${harness.stableRecords.length}** (all individually addressable: **${harness.allIndividuallyAddressable}**)
- Collision groups: ${JSON.stringify(harness.collisionGroups)}

## 3–4. Production fix replays / defect statuses

| Defect | Status |
|---|---|
${contracts.map((c) => `| \`${c.defectId}\` | **${c.status}** |`).join("\n")}

Status rollup: ${JSON.stringify(statusRollup)}

## 5. False-permission adversarial

${JSON.stringify(metricsBundle.adversarial.summary, null, 2)}

## 6. Newly evaluated authentic documents

Count: **${metricsBundle.newlyEvaluatedAuthenticDocuments.length}** (heuristic expansion probes; not GT-backed PASS).

## 7–8. Legal-safety metrics / unverified

See \`26-legal-safety-metrics.json\`. Unavailable GT never converted to PASS.

## 9. SHA / tests / CI / PR

- HEAD: \`${headSha}\`
- Tests: \`npm run live-corpus-quality-gate:phase3\` · \`npx vitest run tests/live-corpus-quality-gate/\`
- PR: #153 draft — do not merge
`;

  fs.writeFileSync(path.join(outDir, "REPORT.md"), md);
  console.log(JSON.stringify({ ok: true, outDir, headSha, statusRollup, verdict: report.gateVerdict }, null, 2));
}

main();
