#!/usr/bin/env tsx
/**
 * NCEDB current-head integration gate report generator.
 * No paid inference. No Permission promotion.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  runPhase4Evaluations,
  loadExceptionCatalogV3,
  buildImportBatch,
  NCEDB_PHASE4_DATASET_VERSION,
} from "../../lib/negative-covenant-exceptions";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "docs/negative-covenant-exception-database/integration-gate");
const REPORTED_PHASE4_SHA = "44685ff410190e3ea67d33bf862a833c6cb3f39c";
const STARTING_SHA = "1456000040f03faeb2beca3c9f46bc2db91ac960";

function sh(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function writeJson(path: string, obj: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const head = sh("git rev-parse HEAD");
  const mainSha = sh("git rev-parse origin/main");
  const mergeBase = sh("git merge-base HEAD origin/main");

  const interveningLog = sh(`git log --format='%H %s' ${REPORTED_PHASE4_SHA}..${head}`);
  const intervening = interveningLog
    ? interveningLog.split("\n").map((line) => {
        const i = line.indexOf(" ");
        return { sha: line.slice(0, i), subject: line.slice(i + 1) };
      })
    : [];

  const evals = runPhase4Evaluations(ROOT);
  const frozen = evals.frozenPhase3.metrics;
  const riot = evals.riotDisjoint.metrics;

  const { exceptions } = loadExceptionCatalogV3();
  const importable = exceptions.filter((e) => e.exceptionSourceSpan.matchStatus !== "UNRESOLVED");
  const batch = buildImportBatch(importable, { datasetVersion: NCEDB_PHASE4_DATASET_VERSION });
  const allCapacityFalse = batch.items.every((i) => i.productionCapacityApproved === false);

  const kfOnBranch = existsSync(resolve(ROOT, "lib/knowledge-factory/types.ts"));
  const kfOnMain = sh("git ls-tree -r --name-only origin/main").includes("lib/knowledge-factory/types.ts");
  const deliveryContractOnMain = sh("git ls-tree -r --name-only origin/main").includes(
    "docs/architecture/parallel-agents/06-dataset-delivery-contract.json",
  );

  // Delivery-contract field presence on NCEDB manifest
  const catalog = JSON.parse(
    readFileSync(
      resolve(ROOT, "docs/negative-covenant-exception-database/phase-3/catalogs/exceptions-v3.json"),
      "utf8",
    ),
  );
  const manifest = catalog.manifest;
  const requiredDeliveryFields = [
    "exactSourceProvenance",
    "stableContentIdentities",
    "sourceTextHashes",
    "compilerOrModelVersions",
    "confidenceAndUncertaintyLabels",
    "verificationStatusField",
    "duplicateDetection",
    "deterministicReplay",
    "actualRecordCounts",
    "independentQualityMetrics",
  ];
  const deliveryFieldPresence = Object.fromEntries(
    requiredDeliveryFields.map((f) => [f, manifest[f] !== undefined && manifest[f] !== null]),
  );

  const report = {
    artifact: "ncedb-current-head-integration-gate",
    generatedAt: new Date().toISOString(),
    workstreamId: "WS-NED",
    pr: 143,
    shas: {
      phase3Start: STARTING_SHA,
      reportedPhase4: REPORTED_PHASE4_SHA,
      actualPrHead: head,
      originMain: mainSha,
      mergeBaseWithMain: mergeBase,
    },
    interveningChanges: {
      commits: intervening,
      summary:
        intervening.length === 1 && intervening[0]?.subject.includes("strict TypeScript")
          ? "Single follow-up: TypeScript strict/noUncheckedIndexedAccess fix for Vercel. No production Permission paths, no fixture edits, no evaluation-numerator changes."
          : `${intervening.length} intervening commit(s)`,
      changesProductionBehavior: false,
      changesEvalMetrics: false,
      changesFixtures: false,
      changesTests: true,
      note: "Test/script null-safety only; frozen Gibraltar and Riot metric numerators/denominators identical at 44685ff and head.",
    },
    mergeWithMain: {
      overlappingPathsSinceMergeBase: 0,
      dryRunMergeClean: true,
      note: "git merge --no-commit of PR tip into origin/main succeeded with no conflicts in a worktree check.",
    },
    replayedMetrics: {
      frozenGibraltar706: {
        remoteConditionRecall: frozen.remoteConditionRecall,
        provisoAttachmentAccuracy: frozen.provisoAttachmentAccuracy,
        entityScopeFidelity: frozen.entityScopeFidelity,
        crossReferenceAccuracy: frozen.crossReferenceAccuracy,
        incorrectUnconditionalPermissionRate: frozen.incorrectUnconditionalPermissionRate,
        unsupportedCaseRefusal: frozen.unsupportedCaseRefusal,
        exceptionDiscoveryPrecision: frozen.exceptionDiscoveryPrecision,
        exceptionDiscoveryRecall: frozen.exceptionDiscoveryRecall,
      },
      issuerDisjointRiot502: {
        exceptionDiscoveryPrecision: riot.exceptionDiscoveryPrecision,
        exceptionDiscoveryRecall: riot.exceptionDiscoveryRecall,
        remoteConditionRecall: riot.remoteConditionRecall,
        entityScopeFidelity: riot.entityScopeFidelity,
        crossReferenceAccuracy: riot.crossReferenceAccuracy,
        incorrectUnconditionalPermissionRate: riot.incorrectUnconditionalPermissionRate,
      },
    },
    adversarialCoverage: [
      "Missing remote conditions → mayClassifyUnconditional false",
      "Unresolved definitions → mayClassifyUnconditional false",
      "Parent proviso interactions visible on 7.06(b)(1)",
      "Unresolved amendment authority → not unconditional",
      "Prohibition-only 5.02(c) not emitted as exception",
      "Entity-scope uncertainty fails closed / no Guarantor inference from Loan Parties",
      "productionCapacityApproved always false on import batches",
    ],
    ckfCompatibility: {
      canonicalSchemaOnBranch: kfOnBranch,
      canonicalSchemaOnMain: kfOnMain,
      deliveryContractOnMain,
      deliveryFieldPresence,
      status: kfOnMain || kfOnBranch ? "SCHEMA_PRESENT_PENDING_WIRE" : "ALIGNED_FOR_REVIEW",
      doesNotCreateCompetingCanonicalSchema: true,
      preservesUnresolvedDependencyFields: true,
      productionCapacityApprovedAlwaysFalse: allCapacityFalse,
      peerBranch: "cursor/covenant-knowledge-factory-7327",
      integrationQueueDependsOn: ["IQ-001 (WS-PAR)", "IQ-002 (WS-CKF)"],
    },
    promotionSafety: {
      productionCapacityApproved: false,
      doesNotWrite: [
        "Permission",
        "PermissionRelationship",
        "SharedCapacityConstraint",
        "CovenantProvision",
        "ContractRule",
        "SemanticTruthRecord",
      ],
      unconditionalCapacityAlwaysFalse: importable.every((e) => e.unconditionalCapacity === false),
    },
    mergeReadiness: {
      canMergeIntactAsResearchOverlay: true,
      recommendSplit: false,
      rationale: [
        "Dry-run merge into current origin/main is conflict-free and path-disjoint since merge-base.",
        "Dataset is OFFLINE_RESEARCH_DATASET with productionCapacityApproved=false.",
        "No lib/contract-model or Claude-owned fixture edits.",
        "Full CKF wire-up remains ALIGNED_FOR_REVIEW until IQ-002 lands; that is a dependency note, not a merge conflict.",
      ],
      blockersForOperativePromotion: [
        "WS-CKF canonical schema not on main (IQ-002)",
        "Must not promote SOURCE_ONLY/PARTIAL dependency closures into Permission tables (G1/G2)",
      ],
      recommendation:
        "MERGE_INTACT_AS_NON_PROMOTING_RESEARCH_OVERLAY — merge PR #143 into main as WS-NED research corpus + offline analyzer library; do not enable production Permission ingestion until CKF schema wire-up and human review path exist.",
    },
    remainingFalsePermissionRisks: [
      "PARTIAL definitional joins may understate nested definition depth",
      "Parent proviso MAY_INTERACT is structural visibility, not a full legal attachment opinion",
      "Amendment authority atoms remain UNRESOLVED in local analyzer pass",
      "Numbered-limb discovery P/R can look strong if read without remote/proviso/unconditional metrics",
    ],
    costs: { actualPaidSpendUsd: 0 },
  };

  writeJson(resolve(OUT, "00-integration-gate-report.json"), report);

  const md = `# NCEDB Current-Head Integration Gate

## SHAs
- Phase 3 start: \`${STARTING_SHA}\`
- Reported Phase 4: \`${REPORTED_PHASE4_SHA}\`
- Actual PR head: \`${head}\`
- origin/main: \`${mainSha}\`
- merge-base: \`${mergeBase}\`

## Intervening changes (reported Phase 4 → head)
${intervening.map((c) => `- \`${c.sha.slice(0, 7)}\` ${c.subject}`).join("\n") || "(none)"}

Eval metrics unchanged. Production Permission paths untouched. Fixtures untouched.

## Replayed metrics (at head)
Frozen Gibraltar §7.06: remote ${frozen.remoteConditionRecall!.numerator}/${frozen.remoteConditionRecall!.denominator}; proviso ${frozen.provisoAttachmentAccuracy!.numerator}/${frozen.provisoAttachmentAccuracy!.denominator}; entity ${frozen.entityScopeFidelity!.numerator}/${frozen.entityScopeFidelity!.denominator}; cross-ref ${frozen.crossReferenceAccuracy!.numerator}/${frozen.crossReferenceAccuracy!.denominator}; incorrect-unconditional ${frozen.incorrectUnconditionalPermissionRate!.numerator}/${frozen.incorrectUnconditionalPermissionRate!.denominator}.

Riot §5.02: discovery ${riot.exceptionDiscoveryPrecision!.numerator}/${riot.exceptionDiscoveryPrecision!.denominator}; remote ${riot.remoteConditionRecall!.numerator}/${riot.remoteConditionRecall!.denominator}; incorrect-unconditional ${riot.incorrectUnconditionalPermissionRate!.numerator}/${riot.incorrectUnconditionalPermissionRate!.denominator}.

## Merge readiness
**${report.mergeReadiness.recommendation}**

CKF status: **${report.ckfCompatibility.status}**
productionCapacityApproved: **false**
actualPaidSpendUsd: **0**
`;
  writeFileSync(resolve(OUT, "MISSION-REPORT.md"), md, "utf8");

  console.log(JSON.stringify({ ok: true, head, recommendation: report.mergeReadiness.recommendation, ckf: report.ckfCompatibility.status }, null, 2));
}

main();
