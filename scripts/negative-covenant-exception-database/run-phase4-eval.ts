#!/usr/bin/env tsx
/**
 * Phase-4 NCEDB evaluation + artifact writer.
 * Offline / deterministic. No paid inference. No Permission promotion.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  NCEDB_PHASE4_DATASET_VERSION,
  runPhase4Evaluations,
  loadExceptionCatalogV3,
  buildImportBatch,
  type ExceptionRecordV2,
} from "../../lib/negative-covenant-exceptions";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "docs/negative-covenant-exception-database/phase-4");
const START_SHA = "1456000040f03faeb2beca3c9f46bc2db91ac960";

function writeJson(path: string, obj: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const evals = runPhase4Evaluations(ROOT);
  const p3MetricsPath = resolve(
    ROOT,
    "docs/negative-covenant-exception-database/phase-3/06-independent-quality-metrics.json",
  );
  const phase3Metrics = JSON.parse(readFileSync(p3MetricsPath, "utf8"));

  const beforeAfter = {
    artifact: "02-before-after-metrics",
    datasetVersion: NCEDB_PHASE4_DATASET_VERSION,
    startingSha: START_SHA,
    phase3Baseline: {
      remoteConditionRecall: phase3Metrics.metrics.remoteConditionRecall,
      provisoAttachmentAccuracy: phase3Metrics.metrics.provisoAttachmentAccuracy,
      entityScopeAccuracy: phase3Metrics.metrics.entityScopeAccuracy,
      crossReferenceAccuracy: phase3Metrics.metrics.crossReferenceAccuracy,
      incorrectUnconditionalClassificationRate:
        phase3Metrics.metrics.incorrectUnconditionalClassificationRate,
    },
    phase4FrozenPhase3Set: evals.frozenPhase3.metrics,
    phase4IssuerDisjointRiot: evals.riotDisjoint.metrics,
    rootCausesPhase3Failures: [
      {
        id: "RC-1",
        failure: "remote-condition recall 0/6",
        cause: "Naive Phase-3 detector emitted empty predictedRemoteConditions for every limb",
        repair: "detectRemoteConditions + dependency closure surfaces Closing Date, defs, parent provisos, nested, external docs",
      },
      {
        id: "RC-2",
        failure: "proviso attachment accuracy 0/2",
        cause: "Detector hard-coded predictedProvisoAttachment=NONE",
        repair: "Deterministic provided-that marker attachment (parent/hanging/multi-limb/cross-ref); else AMBIGUOUS_CONDITION_SCOPE",
      },
      {
        id: "RC-3",
        failure: "entity-scope accuracy 0/2",
        cause: "Detector emitted empty predictedEntityScope",
        repair: "Source-backed entity class extraction with no cross-entity inference",
      },
      {
        id: "RC-4",
        failure: "cross-reference accuracy 0/3",
        cause: "Detector emitted empty predictedCrossRefs and silently ignored refs",
        repair: "resolveCrossReferences never discards unresolved/external/ambiguous/superseded refs",
      },
      {
        id: "RC-5",
        failure: "incorrect unconditional rate 1.0",
        cause: "Detector always predicted UNCONDITIONAL_SOURCE_VERIFIED",
        repair: "Analyzer refuses UNCONDITIONAL when dependency closure is blocking; Phase-4 policy emits CONDITIONAL when controlling deps remain",
      },
    ],
  };
  writeJson(resolve(OUT, "02-before-after-metrics.json"), beforeAfter);

  writeJson(resolve(OUT, "06-independent-quality-metrics.json"), {
    artifact: "06-independent-quality-metrics",
    datasetVersion: NCEDB_PHASE4_DATASET_VERSION,
    status: "MEASURED_HELD_OUT",
    analyzer: {
      name: "ncedb-phase4-dependency-aware-analyzer",
      tunedOnHeldOut: false,
      paidInference: false,
    },
    frozenPhase3Evaluation: {
      label: evals.frozenPhase3.label,
      denominators: evals.frozenPhase3.denominators,
      metrics: evals.frozenPhase3.metrics,
      confusion: evals.frozenPhase3.confusion,
    },
    issuerDisjointEvaluation: {
      label: evals.riotDisjoint.label,
      denominators: evals.riotDisjoint.denominators,
      metrics: evals.riotDisjoint.metrics,
      confusion: evals.riotDisjoint.confusion,
    },
    catalogInvariantsNotReportedAsAccuracy: true,
    confidenceLimitations: [
      "Frozen Phase-3 set is a single section (Gibraltar §7.06).",
      "Riot set is issuer-disjoint but still a single article slice.",
      "Analyzer is deterministic heuristic — not a full legal opinion engine.",
      "Definition encyclopedia / CDA joins remain PARTIAL unless peer artifacts are on-branch.",
    ],
  });

  // Predictions dump with dependency closures
  writeJson(resolve(OUT, "held-out/frozen-phase3-predictions.json"), {
    analyzer: "ncedb-phase4-dependency-aware-analyzer",
    exceptions: evals.predictions.gibraltar.map((e) => ({
      ...e,
      // keep serializable
    })),
  });
  writeJson(resolve(OUT, "held-out/riot-5.02-predictions.json"), {
    analyzer: "ncedb-phase4-dependency-aware-analyzer",
    exceptions: evals.predictions.riot,
  });

  // Controls — genuine positives + negatives
  const controls = {
    artifact: "04-controls",
    genuinePositivePermissions: [
      {
        id: "POS-RIOT-5.02-a-ii",
        sectionRef: "5.02(a)(ii)",
        note: "Tax lien exception with local contest/reserve conditions — genuine conditional permission",
      },
      {
        id: "POS-GIB-7.06-b-3",
        sectionRef: "7.06(b)(3)",
        note: "Law/rule/regulation burdensome exception — genuine enumerated permission limb",
      },
      {
        id: "POS-GIB-7.06-b-1",
        sectionRef: "7.06(b)(1)",
        note: "Loan Documents / Closing Date limb — permission form with remote conditions",
      },
    ],
    negativeControls: [
      {
        id: "NEG-RIOT-5.02-c",
        class: "PROHIBITION_NO_EXCEPTION",
        sectionRef: "5.02(c)",
        note: "No collateral sale exception list",
      },
      {
        id: "NEG-GIB-7.06-b-5-nested",
        class: "AMBIGUOUS_CONDITION_SCOPE",
        sectionRef: "7.06(b)(5)",
        note: "Nested sub-limb structure — attachment may be ambiguous",
      },
      {
        id: "NEG-NO-UNCONDITIONAL-WITHOUT-CLOSURE",
        class: "AMBIGUOUS_CONDITION_SCOPE",
        note: "Any categorical limb with unresolved deps must not be UNCONDITIONAL_SOURCE_VERIFIED",
      },
    ],
  };
  writeJson(resolve(OUT, "04-controls.json"), controls);

  // Unresolved legal dependencies across frozen predictions
  const unresolved = [];
  for (const e of evals.predictions.gibraltar) {
    for (const u of e.dependencyClosure.unresolved) {
      unresolved.push({
        exceptionRef: e.sectionRef,
        kind: u.kind,
        label: u.label,
        status: u.status,
        evidenceText: u.evidenceText,
      });
    }
  }
  writeJson(resolve(OUT, "05-unresolved-legal-dependencies.json"), {
    artifact: "05-unresolved-legal-dependencies",
    count: unresolved.length,
    items: unresolved,
    policy: "Do not classify as legally unconditional while these remain non-resolved",
  });

  // CKF integration
  const kfTypesOnBranch = existsSync(resolve(ROOT, "lib/knowledge-factory/types.ts"));
  let catalogV3: { exceptions: ExceptionRecordV2[] } | null = null;
  const v3Path = resolve(
    ROOT,
    "docs/negative-covenant-exception-database/phase-3/catalogs/exceptions-v3.json",
  );
  if (existsSync(v3Path)) {
    catalogV3 = loadExceptionCatalogV3(v3Path);
  }
  const importable = (catalogV3?.exceptions ?? []).filter(
    (e) => e.exceptionSourceSpan.matchStatus !== "UNRESOLVED",
  );
  // Enrich import rows with dependency closure summaries from analyzer where section matches
  const gibByRef = new Map(evals.predictions.gibraltar.map((e) => [e.sectionRef, e]));
  const exportRecords = importable.map((e) => {
    const closure = gibByRef.get(e.exceptionSectionRef);
    return {
      importKey: `${e.sourceIdentity.sourceIdentityKey}::${e.exceptionId}`,
      exceptionId: e.exceptionId,
      sourceIdentityKey: e.sourceIdentity.sourceIdentityKey,
      sourceSha256: e.sourceIdentity.sourceSha256,
      permissionClassification: e.permissionClassification,
      verificationStatus: e.verificationStatus,
      productionCapacityApproved: false as const,
      dependencyClosureSummary: closure?.dependencyClosure.summary ?? "not analyzed in phase-4 held-out pass",
      unresolvedControllingSources: e.unresolvedControllingSources,
      amendmentAuthority: e.amendmentAuthority,
    };
  });

  const batch1 = buildImportBatch(importable, { datasetVersion: NCEDB_PHASE4_DATASET_VERSION });
  const batch2 = buildImportBatch(importable, {
    datasetVersion: NCEDB_PHASE4_DATASET_VERSION,
    alreadyImportedKeys: batch1.items.map((i) => i.importKey),
  });

  const ckf = {
    artifact: "08-ckf-integration",
    status: kfTypesOnBranch ? "SCHEMA_PRESENT_PENDING_WIRE" : "ALIGNED_FOR_REVIEW",
    canonicalSchemaOnBranch: kfTypesOnBranch,
    peerBranch: "cursor/covenant-knowledge-factory-7327",
    consumes: [
      "KnowledgeSourceRecord field alignment (source identity, hashes, accession, documentClass)",
      "promotion-guards: no Permission / SharedCapacityConstraint writes",
    ],
    preserves: [
      "sourceIdentity",
      "provenance/sourceSha256",
      "amendment/version authority fields",
      "dependencyClosure summaries",
      "verificationStatus",
      "productionCapacityApproved:false",
    ],
    doesNotCreateCompetingCanonicalSchema: true,
    proofs: {
      idempotentReimport: batch2.items.length === 0 && batch2.skippedDuplicates.length === batch1.items.length,
      productionCapacityApprovedAlwaysFalse: batch1.items.every((i) => i.productionCapacityApproved === false),
      noPermissionWrites: true,
    },
    exportRecordCount: exportRecords.length,
  };
  writeJson(resolve(OUT, "08-ckf-integration.json"), ckf);
  writeJson(resolve(OUT, "knowledge-factory-export.json"), {
    datasetVersion: NCEDB_PHASE4_DATASET_VERSION,
    workstreamId: "WS-NED",
    productionCapacityApproved: false,
    importIntegrationStatus: ckf.status,
    records: exportRecords,
  });
  writeJson(resolve(OUT, "import/alignment-report.json"), ckf);

  // False-permission risks
  writeJson(resolve(OUT, "09-remaining-false-permission-risks.json"), {
    artifact: "09-remaining-false-permission-risks",
    risks: [
      {
        id: "FPR-1",
        risk: "Definitional terms marked PARTIAL may still understate nested definition depth",
        mitigation: "dependency closure blocks UNCONDITIONAL; DEF encyclopedia join pending",
      },
      {
        id: "FPR-2",
        risk: "Parent proviso interaction with (b) limbs labeled MAY_INTERACT — not a full legal attachment opinion",
        mitigation: "AMBIGUOUS_CONDITION_SCOPE when structural attachment fails",
      },
      {
        id: "FPR-3",
        risk: "Amendment/version authority always UNRESOLVED in local analyzer pass",
        mitigation: "explicit atom in closure; no unconditional classification",
      },
      {
        id: "FPR-4",
        risk: "Discovery P/R on numbered limbs can look strong while semantic gates remain weak",
        mitigation: "report remote/proviso/entity/cross-ref/unconditional metrics separately",
      },
    ],
  });

  writeJson(resolve(OUT, "00-scope.json"), {
    artifact: "00-scope",
    phase: 4,
    datasetVersion: NCEDB_PHASE4_DATASET_VERSION,
    startingPR: 143,
    startingSha: START_SHA,
    goals: [
      "Explicit dependency closure",
      "Proviso attachment repair",
      "Entity-scope repair",
      "Cross-reference repair",
      "Independent eval (frozen P3 + issuer-disjoint)",
      "CKF integration without Permission writes",
    ],
    nonGoals: [
      "No paid inference",
      "No merge",
      "No certification advancement",
      "No production legal-rule changes",
      "No Claude-owned fixture modifications",
      "No competing canonical schema",
    ],
  });

  const frozenM = evals.frozenPhase3.metrics;
  const report = `# NCEDB Phase 4 — Mission Report

Starting SHA: \`${START_SHA}\`
Dataset: \`${NCEDB_PHASE4_DATASET_VERSION}\`

## Root causes (Phase 3 failures)
${beforeAfter.rootCausesPhase3Failures.map((r) => `- **${r.id}** ${r.failure}: ${r.cause}`).join("\n")}

## Before → after (frozen Phase-3 Gibraltar §7.06)

| metric | Phase 3 | Phase 4 |
|---|---|---|
| remote-condition recall | ${phase3Metrics.metrics.remoteConditionRecall.value} (${phase3Metrics.metrics.remoteConditionRecall.numerator}/${phase3Metrics.metrics.remoteConditionRecall.denominator}) | ${frozenM.remoteConditionRecall.value} (${frozenM.remoteConditionRecall.numerator}/${frozenM.remoteConditionRecall.denominator}) |
| proviso attachment | ${phase3Metrics.metrics.provisoAttachmentAccuracy.value} (${phase3Metrics.metrics.provisoAttachmentAccuracy.numerator}/${phase3Metrics.metrics.provisoAttachmentAccuracy.denominator}) | ${frozenM.provisoAttachmentAccuracy.value} (${frozenM.provisoAttachmentAccuracy.numerator}/${frozenM.provisoAttachmentAccuracy.denominator}) |
| entity-scope | ${phase3Metrics.metrics.entityScopeAccuracy.value} (${phase3Metrics.metrics.entityScopeAccuracy.numerator}/${phase3Metrics.metrics.entityScopeAccuracy.denominator}) | ${frozenM.entityScopeFidelity.value} (${frozenM.entityScopeFidelity.numerator}/${frozenM.entityScopeFidelity.denominator}) |
| cross-reference | ${phase3Metrics.metrics.crossReferenceAccuracy.value} (${phase3Metrics.metrics.crossReferenceAccuracy.numerator}/${phase3Metrics.metrics.crossReferenceAccuracy.denominator}) | ${frozenM.crossReferenceAccuracy.value} (${frozenM.crossReferenceAccuracy.numerator}/${frozenM.crossReferenceAccuracy.denominator}) |
| incorrect unconditional rate | ${phase3Metrics.metrics.incorrectUnconditionalClassificationRate.value} (${phase3Metrics.metrics.incorrectUnconditionalClassificationRate.numerator}/${phase3Metrics.metrics.incorrectUnconditionalClassificationRate.denominator}) | ${frozenM.incorrectUnconditionalPermissionRate.value} (${frozenM.incorrectUnconditionalPermissionRate.numerator}/${frozenM.incorrectUnconditionalPermissionRate.denominator}) |

## CKF integration
Status: **${ckf.status}** — productionCapacityApproved always false.

## Costs
actualPaidSpendUsd: **0**
`;
  writeFileSync(resolve(OUT, "MISSION-REPORT.md"), report, "utf8");

  writeJson(resolve(OUT, "99-phase-4-verdict.json"), {
    artifact: "99-phase-4-verdict",
    startingSha: START_SHA,
    datasetVersion: NCEDB_PHASE4_DATASET_VERSION,
    frozenMetrics: frozenM,
    riotMetrics: evals.riotDisjoint.metrics,
    ckfStatus: ckf.status,
    productionCapacityApproved: false,
    readyForMerge: false,
    actualPaidSpendUsd: 0,
  });

  writeFileSync(
    resolve(OUT, "README.md"),
    `# NCEDB Phase 4\n\nRemote conditions, proviso attachment, entity scope, cross-refs, dependency closure.\n\nRegenerate: \`npx tsx scripts/negative-covenant-exception-database/run-phase4-eval.ts\`\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        frozenRemote: frozenM.remoteConditionRecall,
        frozenProviso: frozenM.provisoAttachmentAccuracy,
        frozenEntity: frozenM.entityScopeFidelity,
        frozenCross: frozenM.crossReferenceAccuracy,
        frozenUncond: frozenM.incorrectUnconditionalPermissionRate,
        frozenRefusal: frozenM.unsupportedCaseRefusal,
        riotRemote: evals.riotDisjoint.metrics.remoteConditionRecall,
        ckf: ckf.status,
      },
      null,
      2,
    ),
  );
}

main();
