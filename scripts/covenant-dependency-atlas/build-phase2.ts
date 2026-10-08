/**
 * Phase 2 runner: completeness v2, unresolved root-cause report, motif audit,
 * structural-index extraction over the authentic corpus, recall sample,
 * KF export with node-identity reconciliation.
 *
 * Large generated datasets write to `.local-dependency-atlas/` (gitignored).
 * Git keeps manifests, checksums, small fixtures, and docs only.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildAtlasDataset, writeAtlasArtifacts } from "./build-atlas";
import { classifyUnresolvedEdges } from "./classify-unresolved";
import { auditMotifs } from "./audit-motifs";
import { buildFixtureCorpusRegistry, corpusSummary, type CorpusEntry } from "./corpus-registry";
import { extractFromStructural, loadTextDocument } from "./extract-from-structural";
import { toKnowledgeFactoryExport } from "./export-kf";
import { reconcileNodeIdentity } from "./node-identity";
import {
  ATLAS_SCHEMA_VERSION,
  AtlasDatasetSchema,
  KnowledgeFactoryExportSchema,
  type AtlasDataset,
  type AtlasDocument,
} from "./schema";

const ROOT = resolve(__dirname, "../..");
const LOCAL = join(ROOT, ".local-dependency-atlas");
const DOCS = join(ROOT, "docs/covenant-dependency-atlas");
const FIXTURE_EXPORT = join(ROOT, "tests/fixtures/covenant-dependency-atlas/export");

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function checksumOf(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Small independently authored expected edges for recall/precision (dev docs only). */
function loadReviewSample(): {
  documentId: string;
  expected: { kind: string; sectionRef?: string; termName?: string; connective: string }[];
}[] {
  const samplePath = join(ROOT, "tests/fixtures/covenant-dependency-atlas/review-samples/structural-recall-sample.json");
  if (!existsSync(samplePath)) return [];
  return JSON.parse(readFileSync(samplePath, "utf-8")) as {
    documentId: string;
    expected: { kind: string; sectionRef?: string; termName?: string; connective: string }[];
  }[];
}

function measureRecallPrecision(docs: AtlasDocument[], samples: ReturnType<typeof loadReviewSample>) {
  let tp = 0;
  let fpProbe = 0;
  let expected = 0;
  const details: unknown[] = [];
  for (const sample of samples) {
    const doc = docs.find((d) => d.documentId === sample.documentId);
    if (!doc) {
      details.push({ documentId: sample.documentId, status: "DOC_MISSING" });
      continue;
    }
    for (const exp of sample.expected) {
      expected += 1;
      const hit = doc.edges.some((e) => {
        if (e.kind !== exp.kind) return false;
        const spanOk = exp.sectionRef
          ? e.sourceSpans.some((s) => (s.sectionRef ?? "").toLowerCase().startsWith(exp.sectionRef!.toLowerCase()))
          : true;
        const termOk = exp.termName
          ? e.toNodeId.includes(exp.termName.toLowerCase().replace(/\s+/g, "_")) || e.rationale.includes(exp.termName)
          : true;
        return spanOk && termOk;
      });
      if (hit) tp += 1;
      details.push({ documentId: sample.documentId, expected: exp, hit });
    }
    // Precision probe: edges of priority kinds without connective evidence class are suspect FPs.
    fpProbe += doc.edges.filter(
      (e) =>
        (e.kind === "RECLASSIFICATION" || e.kind === "COVENANT_TO_SHARED_BASKET") &&
        e.evidenceClass !== "STRUCTURAL_CROSS_REFERENCE" &&
        e.evidenceClass !== "EXPLICIT_SOURCE_CONNECTIVE" &&
        e.evidenceClass !== "STRUCTURAL_DEFINITION_OCCURRENCE",
    ).length;
  }
  const recall = expected === 0 ? null : tp / expected;
  const precision = tp + fpProbe === 0 ? null : tp / (tp + fpProbe);
  return {
    expected,
    truePositives: tp,
    precisionProbeFalsePositives: fpProbe,
    recall,
    precision,
    independentReview: "SAMPLE_AUTHORED_FROM_SOURCE — not legal certification",
    details,
  };
}

function extractCorpus(entries: CorpusEntry[], limit = 50): {
  documents: AtlasDocument[];
  failures: { documentId: string; error: string }[];
} {
  const documents: AtlasDocument[] = [];
  const failures: { documentId: string; error: string }[] = [];
  for (const e of entries.filter((x) => x.available).slice(0, limit)) {
    try {
      const text = loadTextDocument(join(ROOT, e.sourcePath));
      if (text.length < 200) {
        failures.push({ documentId: e.documentId, error: "text too short" });
        continue;
      }
      // Cap extremely large HTML to keep offline runs bounded.
      const clipped = text.length > 1_200_000 ? text.slice(0, 1_200_000) : text;
      const doc = extractFromStructural({
        documentId: e.documentId,
        packageId: e.packageId,
        sourceFile: e.sourcePath,
        label: e.documentId,
        text: clipped,
        split: e.split,
        issuer: e.issuer,
      });
      documents.push(doc);
    } catch (err) {
      failures.push({ documentId: e.documentId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { documents, failures };
}

export function runPhase2(): {
  shaPlaceholder: string;
  gtDataset: AtlasDataset;
  structuralDataset: AtlasDataset;
  paths: Record<string, string>;
} {
  mkdirSync(LOCAL, { recursive: true });
  mkdirSync(join(LOCAL, "exports"), { recursive: true });
  mkdirSync(join(DOCS, "phase-2"), { recursive: true });
  mkdirSync(FIXTURE_EXPORT, { recursive: true });

  // --- Ground-truth-assisted DSGR (Phase 1 lineage, v2 metrics) ---
  const gtDataset = buildAtlasDataset(new Date().toISOString());
  const gtPaths = writeAtlasArtifacts(gtDataset);
  const gtKf = KnowledgeFactoryExportSchema.parse(toKnowledgeFactoryExport(gtDataset));
  const unresolvedReport = classifyUnresolvedEdges(gtDataset.packages.flatMap((p) => p.documents.flatMap((d) => d.edges)));
  const motifAudit = auditMotifs(gtDataset, 25);

  writeJson(join(DOCS, "phase-2/01-unresolved-root-cause.json"), {
    generatedAt: gtDataset.generatedAt,
    totalUnresolved: unresolvedReport.totalUnresolved,
    totalAmbiguous: unresolvedReport.totalAmbiguous,
    byRootCause: unresolvedReport.byRootCause,
    controllingRestrictionRiskCount: unresolvedReport.controllingRestrictionRiskCount,
    examples: unresolvedReport.examples,
  });
  writeJson(join(LOCAL, "exports/unresolved-all.json"), unresolvedReport.all);
  writeJson(join(DOCS, "phase-2/02-motif-audit.json"), motifAudit);

  // --- Structural corpus ---
  const registry = buildFixtureCorpusRegistry();
  const summary = corpusSummary(registry);
  writeJson(join(DOCS, "phase-2/03-corpus-manifest.json"), { summary, entries: registry });

  const { documents: structuralDocs, failures } = extractCorpus(registry, 50);
  const structuralByPkg = new Map<string, AtlasDocument[]>();
  for (const d of structuralDocs) {
    const list = structuralByPkg.get(d.packageId) ?? [];
    list.push(d);
    structuralByPkg.set(d.packageId, list);
  }

  const structuralRaw: AtlasDataset = {
    schemaVersion: ATLAS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    paidInference: false,
    productionResolverTouched: false,
    methodology:
      "Phase 2 STRUCTURAL_INDEX_ONLY extraction: parseDocumentStructure + detectStructuralDefinitions + detectStructuralReferences (read-only). No Phase-3F ground-truth annotations. No textual-similarity-only edges. Evaluation docs (Gibraltar) held out from connective tuning.",
    packages: [...structuralByPkg.entries()].map(([packageId, documents]) => ({ packageId, documents })),
    totals: {
      documents: structuralDocs.length,
      nodes: structuralDocs.reduce((n, d) => n + d.nodes.length, 0),
      uniqueNodes: 0,
      edges: structuralDocs.reduce((n, d) => n + d.edges.length, 0),
      resolved: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.resolution === "RESOLVED").length, 0),
      unresolved: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.resolution === "UNRESOLVED").length, 0),
      ambiguous: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.resolution === "AMBIGUOUS").length, 0),
      diamonds: structuralDocs.reduce((n, d) => n + d.motifs.filter((m) => m.motifType === "DIAMOND_SHARED_DEPENDENCY").length, 0),
      cycles: structuralDocs.reduce((n, d) => n + d.motifs.filter((m) => m.motifType === "GENUINE_CYCLE").length, 0),
    },
  };
  const nodeIdentity = reconcileNodeIdentity(structuralRaw);
  structuralRaw.totals.uniqueNodes = nodeIdentity.atlasNodeCountUnique;
  structuralRaw.nodeIdentity = nodeIdentity;
  const structuralDataset = AtlasDatasetSchema.parse(structuralRaw);
  const structuralKf = KnowledgeFactoryExportSchema.parse(toKnowledgeFactoryExport(structuralDataset));

  // Large exports → local only
  writeJson(join(LOCAL, "exports/structural-atlas-dataset.json"), structuralDataset);
  writeJson(join(LOCAL, "exports/structural-knowledge-factory-dataset.json"), structuralKf);
  writeJson(join(LOCAL, "exports/gt-knowledge-factory-dataset.json"), gtKf);

  const samples = loadReviewSample();
  const recall = measureRecallPrecision(
    structuralDocs.filter((d) => registry.find((r) => r.documentId === d.documentId)?.split === "development"),
    samples,
  );

  const priorityCoverage = {
    RECLASSIFICATION: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "RECLASSIFICATION").length, 0),
    ENTITY_SCOPE: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "ENTITY_SCOPE").length, 0),
    COVENANT_TO_SHARED_BASKET: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_SHARED_BASKET").length, 0),
    COVENANT_TO_CROSS_DOCUMENT: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_CROSS_DOCUMENT").length, 0),
    RATIO_CALCULATION: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "RATIO_CALCULATION").length, 0),
    FINANCIAL_INPUT: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "FINANCIAL_INPUT").length, 0),
    COVENANT_TO_CONDITION: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_CONDITION").length, 0),
    COVENANT_TO_AMENDMENT: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_AMENDMENT").length, 0),
  };

  const evalDocs = structuralDocs.filter((d) => registry.find((r) => r.documentId === d.documentId)?.split === "evaluation");

  const phase2Summary = {
    schemaVersion: ATLAS_SCHEMA_VERSION,
    generatedAt: structuralDataset.generatedAt,
    paidInference: false,
    productionResolverTouched: false,
    merges: false,
    certificationChanges: false,
    corpus: summary,
    extractionFailures: failures,
    groundTruthAssisted: {
      documents: gtDataset.totals.documents,
      edges: gtDataset.totals.edges,
      resolved: gtDataset.totals.resolved,
      unresolved: gtDataset.totals.unresolved,
      ambiguous: gtDataset.totals.ambiguous,
      nodeIdentity: gtKf.nodeIdentity,
      completenessMetricsSample: gtDataset.packages[0]?.documents.map((d) => ({
        documentId: d.documentId,
        metrics: d.completeness.metrics,
        gapCount: d.completeness.gaps.length,
        deprecatedCompletenessScoreMeansInventoryCoverageOnly: d.completeness.completenessScore,
      })),
    },
    structuralIndexOnly: {
      documents: structuralDataset.totals.documents,
      issuers: summary.issuers,
      edges: structuralDataset.totals.edges,
      resolved: structuralDataset.totals.resolved,
      unresolved: structuralDataset.totals.unresolved,
      ambiguous: structuralDataset.totals.ambiguous,
      diamonds: structuralDataset.totals.diamonds,
      cycles: structuralDataset.totals.cycles,
      nodeIdentity,
      priorityCoverage,
      evaluationDocuments: evalDocs.map((d) => ({
        documentId: d.documentId,
        edges: d.edges.length,
        resolved: d.edges.filter((e) => e.resolution === "RESOLVED").length,
      })),
    },
    unresolvedRootCause: {
      totalUnresolved: unresolvedReport.totalUnresolved,
      totalAmbiguous: unresolvedReport.totalAmbiguous,
      byRootCause: unresolvedReport.byRootCause,
      controllingRestrictionRiskCount: unresolvedReport.controllingRestrictionRiskCount,
    },
    motifAudit: {
      cycleCount: motifAudit.cycleCount,
      classifications: Object.fromEntries(
        [...new Set(motifAudit.cycles.map((c) => c.classification))].map((c) => [
          c,
          motifAudit.cycles.filter((x) => x.classification === c).length,
        ]),
      ),
      diamondSampleSize: motifAudit.diamondSampleSize,
      falseCycleFromSharedDependency: motifAudit.falseCycleFromSharedDependency,
      proofSharedDependencyNotCycle: motifAudit.proofSharedDependencyNotCycle,
    },
    recallPrecision: recall,
    knowledgeFactoryImport: {
      status: "EXPORT_READY_LOCAL",
      schemaVersion: structuralKf.schemaVersion,
      localPaths: [
        ".local-dependency-atlas/exports/structural-knowledge-factory-dataset.json",
        ".local-dependency-atlas/exports/gt-knowledge-factory-dataset.json",
      ],
      note: "Coordinate durable import with WS-CKF (cursor/covenant-knowledge-factory-7327). Atlas export is interchange; CKF maps into knowledge_relationship_edges without collapsing unresolved edges. Bulk JSON not committed to git.",
      peerBranches: {
        edgarBackfill: "cursor/edgar-historical-backfill-c45c",
        knowledgeFactory: "cursor/covenant-knowledge-factory-7327",
        ckgBenchmark: "cursor/covenant-knowledge-generalization-bench-7f51",
      },
    },
    checksums: {} as Record<string, string>,
  };

  // Small portable KF slice for fixtures (edges sample + full unresolved summary) — not the multi-MB dump.
  writeJson(join(FIXTURE_EXPORT, "knowledge-factory-dataset.portable.json"), {
    schemaVersion: structuralKf.schemaVersion,
    atlasSchemaVersion: structuralKf.atlasSchemaVersion,
    generatedAt: structuralKf.generatedAt,
    paidInference: false,
    merges: false,
    certificationChanges: false,
    productionResolverTouched: false,
    counts: structuralKf.counts,
    nodeIdentity: structuralKf.nodeIdentity,
    unresolvedRelationshipsSample: structuralKf.unresolvedRelationships.slice(0, 50),
    completenessReports: structuralKf.completenessReports,
    note: "Portable subset. Full export at .local-dependency-atlas/exports/structural-knowledge-factory-dataset.json",
  });

  writeJson(join(DOCS, "phase-2/00-summary.json"), phase2Summary);
  writeJson(join(DOCS, "phase-2/04-recall-precision.json"), recall);
  writeJson(join(DOCS, "phase-2/05-priority-coverage.json"), priorityCoverage);

  const checksumPaths = [
    join(DOCS, "phase-2/00-summary.json"),
    join(DOCS, "phase-2/01-unresolved-root-cause.json"),
    join(DOCS, "phase-2/02-motif-audit.json"),
    join(DOCS, "phase-2/03-corpus-manifest.json"),
    join(LOCAL, "exports/structural-knowledge-factory-dataset.json"),
    join(LOCAL, "exports/gt-knowledge-factory-dataset.json"),
  ];
  for (const p of checksumPaths) {
    if (existsSync(p)) phase2Summary.checksums[p.replace(ROOT + "/", "")] = checksumOf(p);
  }
  writeJson(join(DOCS, "phase-2/00-summary.json"), phase2Summary);
  writeJson(join(DOCS, "phase-2/06-checksums.json"), phase2Summary.checksums);

  // Remove / replace mega git fixtures with pointers
  writeJson(join(FIXTURE_EXPORT, "README.md".replace("README.md", "EXPORT_POLICY.json")), {
    policy: "Full multi-MB atlas JSON lives under .local-dependency-atlas/exports (gitignored). Git keeps portable subsets + checksums.",
    rebuild: "npx tsx scripts/covenant-dependency-atlas/build-phase2.ts",
  });

  return {
    shaPlaceholder: "SET_AFTER_COMMIT",
    gtDataset,
    structuralDataset,
    paths: {
      phase2Summary: join(DOCS, "phase-2/00-summary.json"),
      unresolved: join(DOCS, "phase-2/01-unresolved-root-cause.json"),
      motifs: join(DOCS, "phase-2/02-motif-audit.json"),
      corpus: join(DOCS, "phase-2/03-corpus-manifest.json"),
      localStructuralKf: join(LOCAL, "exports/structural-knowledge-factory-dataset.json"),
      gtSummary: gtPaths.summaryPath,
    },
  };
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("build-phase2.ts") || process.argv[1].endsWith("build-phase2.js"));

if (isDirectRun) {
  const result = runPhase2();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        gtEdges: result.gtDataset.totals.edges,
        structuralDocs: result.structuralDataset.totals.documents,
        structuralEdges: result.structuralDataset.totals.edges,
        paths: result.paths,
      },
      null,
      2,
    ),
  );
}
