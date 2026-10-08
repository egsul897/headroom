/**
 * Phase 4 runner: FN dispositions, recall remediation, independent precision,
 * controlling-risk triage, definition resolution, CKF integration, legal-safety probes.
 *
 * Frozen Phase-3 135-edge benchmark is never mutated.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeControllingRisks } from "./analyze-controlling-risks";
import { analyzeMissingDefinitions } from "./analyze-definitions";
import { buildAtlasDataset } from "./build-atlas";
import { validateCkfCanonicalIntegration } from "./ckf-canonical-integration";
import { buildFixtureCorpusRegistry, corpusSummary } from "./corpus-registry";
import { extractFromStructural, loadTextDocument } from "./extract-from-structural";
import { runIndependentPrecisionAudit } from "./independent-precision-audit";
import { investigateFalseNegatives } from "./investigate-false-negatives";
import { runLegalSafetyProbes } from "./legal-safety-probes";
import { measureRecallCorrected, measureRecallPhase3Harness, type ExpectedEdge } from "./measure-recall";
import type { AtlasDocument } from "./schema";

const ROOT = resolve(__dirname, "../..");
const LOCAL = join(ROOT, ".local-dependency-atlas");
const DOCS = join(ROOT, "docs/covenant-dependency-atlas/phase-4");
const FROZEN_GT = join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json");
const FROZEN_COPY = join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.FROZEN.json");

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function checksumOf(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function extractDocs(): AtlasDocument[] {
  const registry = buildFixtureCorpusRegistry();
  const docs: AtlasDocument[] = [];
  for (const e of registry.filter((x) => x.available)) {
    const text = loadTextDocument(join(ROOT, e.sourcePath));
    if (text.length < 200) continue;
    const clipped = text.length > 1_200_000 ? text.slice(0, 1_200_000) : text;
    docs.push(
      extractFromStructural({
        documentId: e.documentId,
        packageId: e.packageId,
        sourceFile: e.sourcePath,
        label: e.documentId,
        text: clipped,
        split: e.split === "evaluation" ? "evaluation" : "development",
        issuer: e.issuer,
      }),
    );
  }
  return docs;
}

export function runPhase4(): Record<string, unknown> {
  mkdirSync(DOCS, { recursive: true });
  mkdirSync(join(LOCAL, "exports"), { recursive: true });

  const startingSha = "9c6f56c810fef1fdaa985155163c96560c2bae00";
  const shaAtBuild = gitSha();

  // Freeze GT: copy + checksum; never rewrite original via author script in this phase.
  if (!existsSync(FROZEN_COPY)) {
    copyFileSync(FROZEN_GT, FROZEN_COPY);
  }
  const frozenSha = checksumOf(FROZEN_GT);
  const frozenCopySha = checksumOf(FROZEN_COPY);
  if (frozenSha !== frozenCopySha) {
    // Prefer committed FROZEN copy if live file drifted from author script timestamps only —
    // but if content differs beyond authoredAt, restore from FROZEN.
    const live = JSON.parse(readFileSync(FROZEN_GT, "utf-8")) as { edges: unknown[] };
    const frozen = JSON.parse(readFileSync(FROZEN_COPY, "utf-8")) as { edges: unknown[] };
    if (JSON.stringify(live.edges) !== JSON.stringify(frozen.edges)) {
      copyFileSync(FROZEN_COPY, FROZEN_GT);
    }
  }

  const gtPayload = JSON.parse(readFileSync(FROZEN_GT, "utf-8")) as {
    edges: ExpectedEdge[];
    totals: unknown;
  };
  writeJson(join(DOCS, "00-frozen-benchmark.json"), {
    path: "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json",
    frozenCopyPath: "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.FROZEN.json",
    sha256: checksumOf(FROZEN_GT),
    edgeCount: gtPayload.edges.length,
    immutable: true,
    policy: "Do not tune on Knife River BLIND. Do not relabel evaluation examples solely because extractor disagrees. GT corrections require source evidence + adjudication + immutable original record.",
    knifeRiverBlind: "PRESERVED_UNREAD",
  });

  const fnReport = investigateFalseNegatives();
  // 01 already written by investigateFalseNegatives

  const docs = extractDocs();
  writeJson(join(LOCAL, "exports/phase4-structural-docs-summary.json"), {
    documents: docs.length,
    edges: docs.reduce((n, d) => n + d.edges.length, 0),
  });

  const phase3Harness = measureRecallPhase3Harness(docs, gtPayload.edges);
  const corrected = measureRecallCorrected(docs, gtPayload.edges);

  writeJson(join(DOCS, "02-recall-remediation.json"), {
    phase3Reported: {
      expected: 135,
      truePositives: 93,
      falseNegatives: 42,
      recall: 0.6888888888888889,
      evaluationRecall: 0.5869565217391305,
    },
    phase3HarnessRecomputedOnCurrentAdapter: phase3Harness,
    phase4CorrectedHarness: corrected,
    note: "Corrected harness uses termName when present; otherwise kind-only. toLabel is not an identity key. Frozen GT unchanged.",
  });

  const precision = runIndependentPrecisionAudit(docs);
  writeJson(join(LOCAL, "exports/phase4-precision-sample-rows.json"), precision.rows);
  writeJson(join(DOCS, "03-independent-precision.json"), {
    ...precision,
    rowsSample: precision.rows.slice(0, 40),
    rows: undefined,
  });

  // Controlling-restriction triage on GT-assisted DSGR edges (same 135 open risks surface)
  const gtDataset = buildAtlasDataset(new Date().toISOString());
  const gtEdges = gtDataset.packages.flatMap((p) => p.documents.flatMap((d) => d.edges));
  const gtNodes = gtDataset.packages.flatMap((p) => p.documents.flatMap((d) => d.nodes));
  const controlling = analyzeControllingRisks(gtEdges);

  const triage = controlling.defectCards.map((card) => {
    let disposition: "ATLAS_CAN_RESOLVE" | "REQUIRES_OTHER_WORKSTREAM" | "PRESERVE_UNRESOLVED_BLOCKER" = "PRESERVE_UNRESOLVED_BLOCKER";
    let coordinateWith: string | null = null;
    if (card.category === "AMENDMENT_TARGET_RESOLUTION") {
      disposition = "REQUIRES_OTHER_WORKSTREAM";
      coordinateWith = "PR #150 amendment-chain-research (cursor/amendment-chain-research-2926)";
    } else if (card.category === "REMOTE_CONDITIONS") {
      disposition = "REQUIRES_OTHER_WORKSTREAM";
      coordinateWith = "Legal Core + Negative Covenant Exception Database";
    } else if (card.category === "AMBIGUOUS_REFERENCE") {
      disposition = "REQUIRES_OTHER_WORKSTREAM";
      coordinateWith = "Structural reference resolver (duplicate TOC/body paths)";
    } else if (card.category === "CROSS_DOCUMENT_RESTRICTIONS") {
      disposition = "REQUIRES_OTHER_WORKSTREAM";
      coordinateWith = "Package-graph / CKF cross-document identity";
    } else if (card.category === "MISSING_DEFINITIONS") {
      disposition = "ATLAS_CAN_RESOLVE";
      coordinateWith = "Definition Encyclopedia (partial); otherwise preserve UNRESOLVED";
    }
    return {
      ...card,
      disposition,
      coordinateWith,
      neverConvertToAffirmativePermission: true,
    };
  });

  writeJson(join(LOCAL, "exports/phase4-controlling-triage-all.json"), triage);
  writeJson(join(DOCS, "04-controlling-restriction-triage.json"), {
    totalOpenControllingRisks: controlling.totalOpenControllingRisks,
    byCategory: controlling.byCategory,
    dispositionCounts: {
      ATLAS_CAN_RESOLVE: triage.filter((t) => t.disposition === "ATLAS_CAN_RESOLVE").length,
      REQUIRES_OTHER_WORKSTREAM: triage.filter((t) => t.disposition === "REQUIRES_OTHER_WORKSTREAM").length,
      PRESERVE_UNRESOLVED_BLOCKER: triage.filter((t) => t.disposition === "PRESERVE_UNRESOLVED_BLOCKER").length,
    },
    sample: triage.slice(0, 40),
    policy: "Never convert an unresolved dependency into affirmative permission.",
  });

  const defReport = analyzeMissingDefinitions(gtEdges, gtNodes);
  // Also scan structural unresolved missing-def edges from Phase-4 adapter
  const structuralMissing = docs.flatMap((d) =>
    d.edges.filter((e) => e.kind === "COVENANT_TO_DEFINITION" && e.resolution === "UNRESOLVED" && e.rootCause === "MISSING_DEFINITION"),
  );
  writeJson(join(DOCS, "05-definition-resolution.json"), {
    gtAssistedMissingDefinitionClass: defReport.totalMissingDefinition,
    bySubtype: defReport.bySubtype,
    examples: defReport.examples,
    coordinationNotes: defReport.coordinationNotes,
    structuralFailClosedMissingDefEdges: structuralMissing.length,
    structuralFailClosedSample: structuralMissing.slice(0, 15).map((e) => ({
      edgeId: e.edgeId,
      rationale: e.rationale,
      unresolvedReason: e.unresolvedReason,
      excerpt: e.sourceSpans[0]?.excerpt ?? null,
    })),
    policy: "Do not fabricate definitions to improve resolution statistics.",
  });

  const ckf = validateCkfCanonicalIntegration();
  writeJson(join(DOCS, "06-ckf-integration.json"), ckf);

  const safety = runLegalSafetyProbes(docs);
  writeJson(join(DOCS, "07-legal-safety-probes.json"), safety);

  const registry = buildFixtureCorpusRegistry();
  const summary = corpusSummary(registry);

  const phase4Summary = {
    schemaVersion: "covenant-dependency-atlas.phase-4",
    generatedAt: new Date().toISOString(),
    startingSha,
    reportedPhase3Sha: "3a41dbfd34835689a301075a0bbfb43b3c46cfc6",
    observedGithubHeadAtMissionStart: "9c6f56c810fef1fdaa985155163c96560c2bae00",
    shaAtBuild,
    shaDriftReconciliation: {
      commitsAfterReportedPhase3Sha: [
        { sha: "9c6f56c810fef1fdaa985155163c96560c2bae00", summary: "Fix Phase 3 atlas TS2367 errors breaking next build." },
      ],
      phase4BegunBeforeThisRun: false,
      preserved: true,
    },
    paidInference: false,
    productionResolverTouched: false,
    merges: false,
    certificationChanges: false,
    knifeRiverBlind: "PRESERVED_UNREAD",
    frozenBenchmark: {
      edges: gtPayload.edges.length,
      sha256: checksumOf(FROZEN_GT),
    },
    falseNegatives: {
      total: fnReport.total,
      byRootCause: fnReport.byRootCause,
      bySystemicGroup: fnReport.bySystemicGroup,
      measurementArtifacts: fnReport.measurementArtifacts,
    },
    recall: {
      phase3ReportedOverall: 0.6888888888888889,
      phase4CorrectedOverall: corrected.overall.recall,
      phase4CorrectedBySplit: corrected.bySplit,
      phase4CorrectedByFamily: corrected.byFamily,
      phase3HarnessRecomputed: phase3Harness.overall.recall,
    },
    independentPrecision: {
      sampleSize: precision.sampleSize,
      byVerdict: precision.byVerdict,
      overallPrecisionAmongResolvedClaims: precision.overallPrecisionAmongResolvedClaims,
      wilsonPrecisionLow: precision.wilsonPrecisionLow,
      wilsonPrecisionHigh: precision.wilsonPrecisionHigh,
    },
    controllingRestrictionRisks: {
      total: controlling.totalOpenControllingRisks,
      byCategory: controlling.byCategory,
    },
    definitionResolution: {
      gtAssisted: defReport.totalMissingDefinition,
      bySubtype: defReport.bySubtype,
      structuralFailClosedMissingDefEdges: structuralMissing.length,
    },
    ckfIntegration: {
      status: ckf.status,
      claimed113CorpusAccessible: ckf.claimed113CorpusAccessible,
      infrastructureBlocker: ckf.infrastructureBlocker,
      idempotentImport: ckf.idempotentImport,
      promotedToLegalTruth: ckf.promotedToLegalTruth,
    },
    legalSafetyProbes: {
      passed: safety.passed,
      failed: safety.failed,
      affirmativePermissionCount: safety.affirmativePermissionCount,
    },
    corpus: summary,
    structuralDocs: docs.length,
    structuralEdges: docs.reduce((n, d) => n + d.edges.length, 0),
    checksums: {} as Record<string, string>,
  };

  writeJson(join(DOCS, "00-summary.json"), phase4Summary);
  const checksumPaths = [
    join(DOCS, "00-summary.json"),
    join(DOCS, "00-frozen-benchmark.json"),
    join(DOCS, "01-false-negative-dispositions.json"),
    join(DOCS, "02-recall-remediation.json"),
    join(DOCS, "03-independent-precision.json"),
    join(DOCS, "04-controlling-restriction-triage.json"),
    join(DOCS, "05-definition-resolution.json"),
    join(DOCS, "06-ckf-integration.json"),
    join(DOCS, "07-legal-safety-probes.json"),
  ];
  for (const p of checksumPaths) {
    if (existsSync(p)) phase4Summary.checksums[p.replace(`${ROOT}/`, "")] = checksumOf(p);
  }
  writeJson(join(DOCS, "00-summary.json"), phase4Summary);
  writeJson(join(DOCS, "08-checksums.json"), phase4Summary.checksums);

  return phase4Summary;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("build-phase4.ts") || process.argv[1].endsWith("build-phase4.js"));

if (isDirectRun) {
  const summary = runPhase4();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        correctedRecall: (summary as { recall: { phase4CorrectedOverall: number | null } }).recall.phase4CorrectedOverall,
        precision: (summary as { independentPrecision: { overallPrecisionAmongResolvedClaims: number | null } }).independentPrecision
          .overallPrecisionAmongResolvedClaims,
        ckfStatus: (summary as { ckfIntegration: { status: string } }).ckfIntegration.status,
        safetyFailed: (summary as { legalSafetyProbes: { failed: number } }).legalSafetyProbes.failed,
      },
      null,
      2,
    ),
  );
}
