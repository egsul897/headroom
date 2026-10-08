/**
 * Build the Covenant Dependency Atlas dataset from Phase-3F ground truth
 * plus hand-authored critical edges. Writes atlas JSON, KF export, and
 * per-document completeness reports.
 *
 * Zero paid inference. Does not touch production dependency resolver/compiler.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { extractDocumentAtlas, loadGroundTruthDocument } from "./extract-from-ground-truth";
import { toKnowledgeFactoryExport } from "./export-kf";
import {
  ATLAS_SCHEMA_VERSION,
  AtlasDatasetSchema,
  AtlasEdgeSchema,
  AtlasNodeSchema,
  KnowledgeFactoryExportSchema,
  type AtlasDataset,
  type AtlasEdge,
  type AtlasNode,
} from "./schema";

const ROOT = resolve(__dirname, "../..");

const GT_DIR = join(ROOT, "tests/fixtures/unseen-packages/phase-3f-ground-truth");
const AUTHORED_DIR = join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges");
const OUT_FIXTURE = join(ROOT, "tests/fixtures/covenant-dependency-atlas/export");
const OUT_DOCS = join(ROOT, "docs/covenant-dependency-atlas");
const OUT_DOCS_EXPORT = join(OUT_DOCS, "export");
const OUT_COMPLETENESS = join(OUT_DOCS, "completeness-reports");

const DOCUMENTS = [
  { id: "doc-a", file: "ground-truth-doc-a.json", authored: "dsgr-doc-a-critical.json" },
  { id: "doc-b", file: "ground-truth-doc-b.json", authored: null },
  { id: "doc-c", file: "ground-truth-doc-c.json", authored: null },
  { id: "doc-d", file: "ground-truth-doc-d.json", authored: null },
] as const;

function loadAuthored(path: string | null): { edges: AtlasEdge[]; nodes: AtlasNode[] } {
  if (!path) return { edges: [], nodes: [] };
  const raw = JSON.parse(readFileSync(join(AUTHORED_DIR, path), "utf-8")) as {
    edges?: unknown[];
    nodes?: unknown[];
  };
  return {
    edges: (raw.edges ?? []).map((e) => AtlasEdgeSchema.parse(e)),
    nodes: (raw.nodes ?? []).map((n) => AtlasNodeSchema.parse(n)),
  };
}

export function buildAtlasDataset(generatedAt = new Date().toISOString()): AtlasDataset {
  const documents = DOCUMENTS.map((d) => {
    const gt = loadGroundTruthDocument(join(GT_DIR, d.file));
    const authored = loadAuthored(d.authored);
    return extractDocumentAtlas({
      packageId: "dsgr-2022-2025-credit-facility",
      doc: gt,
      authoredEdges: authored.edges,
      authoredNodes: authored.nodes,
    });
  });

  const totals = {
    documents: documents.length,
    nodes: documents.reduce((n, d) => n + d.nodes.length, 0),
    edges: documents.reduce((n, d) => n + d.edges.length, 0),
    resolved: documents.reduce((n, d) => n + d.edges.filter((e) => e.resolution === "RESOLVED").length, 0),
    unresolved: documents.reduce((n, d) => n + d.edges.filter((e) => e.resolution === "UNRESOLVED").length, 0),
    ambiguous: documents.reduce((n, d) => n + d.edges.filter((e) => e.resolution === "AMBIGUOUS").length, 0),
    diamonds: documents.reduce(
      (n, d) => n + d.motifs.filter((m) => m.motifType === "DIAMOND_SHARED_DEPENDENCY").length,
      0,
    ),
    cycles: documents.reduce((n, d) => n + d.motifs.filter((m) => m.motifType === "GENUINE_CYCLE").length, 0),
  };

  const dataset: AtlasDataset = {
    schemaVersion: ATLAS_SCHEMA_VERSION,
    generatedAt,
    paidInference: false,
    productionResolverTouched: false,
    methodology:
      "Source-backed directed edges from Phase-3F ground-truth inventories (keyDefinedTerms, unitType, explicit SHARED RESOURCE / ENTITY SCOPE / cross-document notes) plus explicit legal connectives in description/notes and a small hand-authored critical overlay. Bare textual similarity never admits an edge. Unresolved and ambiguous references are preserved. Production dependency resolver and compiler are untouched.",
    packages: [{ packageId: "dsgr-2022-2025-credit-facility", documents }],
    totals,
  };

  return AtlasDatasetSchema.parse(dataset);
}

export function writeAtlasArtifacts(dataset: AtlasDataset): {
  atlasPath: string;
  kfPath: string;
  summaryPath: string;
  completenessPaths: string[];
} {
  for (const dir of [OUT_FIXTURE, OUT_DOCS_EXPORT, OUT_COMPLETENESS]) mkdirSync(dir, { recursive: true });

  const atlasPath = join(OUT_FIXTURE, "atlas-dataset.json");
  writeFileSync(atlasPath, `${JSON.stringify(dataset, null, 2)}\n`);

  const kf = KnowledgeFactoryExportSchema.parse(toKnowledgeFactoryExport(dataset));
  const kfPath = join(OUT_FIXTURE, "knowledge-factory-dataset.json");
  writeFileSync(kfPath, `${JSON.stringify(kf, null, 2)}\n`);

  // Docs export directory keeps a pointer (not a second multi-MB copy).
  writeFileSync(
    join(OUT_DOCS_EXPORT, "README.md"),
    [
      "# Knowledge-factory dataset export",
      "",
      "Canonical artifacts (rebuild with `npx tsx scripts/covenant-dependency-atlas/build-atlas.ts`):",
      "",
      "- `tests/fixtures/covenant-dependency-atlas/export/atlas-dataset.json`",
      "- `tests/fixtures/covenant-dependency-atlas/export/knowledge-factory-dataset.json`",
      "",
      `Generated at: ${dataset.generatedAt}`,
      `Edges: ${dataset.totals.edges}; unresolved+ambiguous: ${dataset.totals.unresolved + dataset.totals.ambiguous}`,
      "",
    ].join("\n"),
  );

  const completenessPaths: string[] = [];
  for (const doc of dataset.packages[0]!.documents) {
    const p = join(OUT_COMPLETENESS, `${doc.documentId}.json`);
    writeFileSync(p, `${JSON.stringify(doc.completeness, null, 2)}\n`);
    completenessPaths.push(p);
  }

  const summary = {
    schemaVersion: dataset.schemaVersion,
    generatedAt: dataset.generatedAt,
    paidInference: false,
    productionResolverTouched: false,
    merges: false,
    certificationChanges: false,
    totals: dataset.totals,
    kfCounts: kf.counts,
    documents: dataset.packages[0]!.documents.map((d) => ({
      documentId: d.documentId,
      nodes: d.nodes.length,
      edges: d.edges.length,
      resolved: d.completeness.resolvedEdgeCount,
      unresolved: d.completeness.unresolvedEdgeCount,
      ambiguous: d.completeness.ambiguousEdgeCount,
      diamonds: d.completeness.diamondCount,
      cycles: d.completeness.cycleCount,
      completenessScore: d.completeness.completenessScore,
      gapCount: d.completeness.gaps.length,
    })),
    unresolvedRelationshipCount: kf.unresolvedRelationships.length,
  };
  const summaryPath = join(OUT_DOCS, "00-summary.json");
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  return { atlasPath, kfPath, summaryPath, completenessPaths };
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("build-atlas.ts") || process.argv[1].endsWith("build-atlas.js"));

if (isDirectRun) {
  const dataset = buildAtlasDataset();
  const paths = writeAtlasArtifacts(dataset);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, totals: dataset.totals, paths }, null, 2));
}
