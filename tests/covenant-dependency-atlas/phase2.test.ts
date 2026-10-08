import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAtlasDataset } from "../../scripts/covenant-dependency-atlas/build-atlas";
import { classifyUnresolvedEdges } from "../../scripts/covenant-dependency-atlas/classify-unresolved";
import { auditMotifs } from "../../scripts/covenant-dependency-atlas/audit-motifs";
import { buildFixtureCorpusRegistry, corpusSummary } from "../../scripts/covenant-dependency-atlas/corpus-registry";
import { extractFromStructural, loadTextDocument } from "../../scripts/covenant-dependency-atlas/extract-from-structural";
import { toKnowledgeFactoryExport } from "../../scripts/covenant-dependency-atlas/export-kf";
import { assertNoSilentNodeLoss, reconcileNodeIdentity } from "../../scripts/covenant-dependency-atlas/node-identity";
import { ATLAS_SCHEMA_VERSION, PRIORITY_EDGE_KINDS } from "../../scripts/covenant-dependency-atlas/schema";
import { analyzeGraph } from "../../scripts/covenant-dependency-atlas/graph-analysis";
import { AtlasEdgeSchema, AtlasNodeSchema } from "../../scripts/covenant-dependency-atlas/schema";

const ROOT = join(__dirname, "../..");

describe("Dependency Atlas Phase 2", () => {
  const dataset = buildAtlasDataset("2026-10-08T22:00:00.000Z");

  it("uses atlas schema v2 and never treats inventory coverage as legal verification", () => {
    expect(dataset.schemaVersion).toBe(ATLAS_SCHEMA_VERSION);
    for (const doc of dataset.packages[0]!.documents) {
      expect(doc.completeness.metrics.legalSemanticVerification).toBe(0);
      expect(doc.completeness.metrics.legalSemanticVerificationStatus).toBe("NOT_PERFORMED");
      expect(doc.completeness.gaps.some((g) => g.includes("LEGAL_SEMANTIC_VERIFICATION"))).toBe(true);
      // Deprecated completenessScore equals inventoryCoverage only.
      expect(doc.completeness.completenessScore).toBe(doc.completeness.metrics.inventoryCoverage);
      // With unresolved edges, resolution rate must be < 1.
      if (doc.completeness.unresolvedEdgeCount + doc.completeness.ambiguousEdgeCount > 0) {
        expect(doc.completeness.metrics.edgeResolutionRate).toBeLessThan(1);
      }
    }
  });

  it("records priority gaps even when inventory minimum is zero (e.g. RECLASSIFICATION on DSGR)", () => {
    const docA = dataset.packages[0]!.documents.find((d) => d.documentId === "doc-a")!;
    const reclass = docA.completeness.buckets.find((b) => b.kind === "RECLASSIFICATION")!;
    expect(reclass.priorityGap).toBe(true);
    expect(docA.completeness.gaps.some((g) => g.includes("RECLASSIFICATION") && g.includes("PRIORITY GAP"))).toBe(true);
    for (const kind of PRIORITY_EDGE_KINDS) {
      const bucket = docA.completeness.buckets.find((b) => b.kind === kind)!;
      if (bucket.observedResolved + bucket.observedUnresolved + bucket.observedAmbiguous === 0) {
        expect(bucket.priorityGap).toBe(true);
      }
    }
  });

  it("classifies all unresolved/ambiguous edges with root causes and countable distribution", () => {
    const edges = dataset.packages.flatMap((p) => p.documents.flatMap((d) => d.edges));
    const report = classifyUnresolvedEdges(edges);
    expect(report.totalUnresolved + report.totalAmbiguous).toBeGreaterThan(0);
    const sum = Object.values(report.byRootCause).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.totalUnresolved + report.totalAmbiguous);
    expect(report.examples.length).toBeGreaterThan(0);
    expect(report.examples.every((e) => e.sourceSpans.length > 0)).toBe(true);
  });

  it("audits all cycles and proves shared diamonds are not false cycles", () => {
    const audit = auditMotifs(dataset, 25);
    expect(audit.cycleCount).toBe(dataset.totals.cycles);
    expect(audit.cycles).toHaveLength(audit.cycleCount);
    expect(audit.falseCycleFromSharedDependency).toBe(0);
    expect(audit.proofSharedDependencyNotCycle).toMatch(/none were also classified as cycles/i);
  });

  it("reconciles raw vs unique node identity without silent data loss", () => {
    const recon = reconcileNodeIdentity(dataset);
    assertNoSilentNodeLoss(recon);
    expect(recon.atlasNodeCountRaw).toBe(dataset.totals.nodes);
    expect(recon.atlasNodeCountUnique).toBe(dataset.totals.uniqueNodes);
    expect(recon.kfExportNodeCount).toBe(recon.atlasNodeCountUnique);
    expect(recon.silentDataLoss).toBe(false);
    const kf = toKnowledgeFactoryExport(dataset);
    expect(kf.nodes.length).toBe(recon.kfExportNodeCount);
    expect(kf.nodeIdentity.atlasNodeCountRaw - kf.nodeIdentity.atlasNodeCountUnique).toBe(
      recon.duplicateNodeIds.reduce((n, d) => n + (d.occurrences - 1), 0),
    );
  });

  it("extracts dependency candidates from raw structural indexes without ground truth", () => {
    const path = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt";
    const text = loadTextDocument(join(ROOT, path));
    const doc = extractFromStructural({
      documentId: "lsb-defs-test",
      packageId: "lsb-2023",
      sourceFile: path,
      label: "LSB definitions excerpt",
      text,
      split: "development",
      issuer: "LSB",
    });
    expect(doc.extractionMode).toBe("STRUCTURAL_INDEX_ONLY");
    expect(doc.edges.length).toBeGreaterThan(0);
    expect(doc.edges.every((e) => e.evidenceClass !== "GROUND_TRUTH_INVENTORY_DECLARATION")).toBe(true);
    expect(doc.edges.every((e) => e.evidenceClass !== "EXPLICIT_GROUND_TRUTH_NOTE")).toBe(true);
  });

  it("registers an authentic corpus with evaluation holdout separate from development", () => {
    const registry = buildFixtureCorpusRegistry();
    const summary = corpusSummary(registry);
    expect(summary.available).toBeGreaterThanOrEqual(20);
    // Phase 3: Gibraltar is DEVELOPMENT per Arch+Cert; sealed eval is cnmd-htm-amd2.
    expect(registry.some((e) => e.documentId === "gibraltar-ca" && e.split === "development")).toBe(true);
    expect(registry.some((e) => e.documentId === "cnmd-htm-amd2" && e.split === "evaluation")).toBe(true);
    expect(registry.filter((e) => e.split === "development" && e.available).length).toBeGreaterThan(15);
    expect(summary.issuers.length).toBeGreaterThan(5);
    expect(summary.holdoutIntegrity?.knifeRiverBlind).toMatch(/PRESERVED_UNREAD/);
  });

  it("graph fixtures still distinguish diamond shared deps from circular definitions", () => {
    const diamond = JSON.parse(
      readFileSync(join(ROOT, "tests/fixtures/covenant-dependency-atlas/graph-fixtures/diamond-shared-basket.json"), "utf-8"),
    );
    const cycle = JSON.parse(
      readFileSync(join(ROOT, "tests/fixtures/covenant-dependency-atlas/graph-fixtures/circular-definitions.json"), "utf-8"),
    );
    const d = analyzeGraph(
      diamond.nodes.map((n: unknown) => AtlasNodeSchema.parse(n)),
      diamond.edges.map((e: unknown) =>
        AtlasEdgeSchema.parse({ rootCause: null, controllingRestrictionRisk: false, ...(e as object) }),
      ),
    );
    const c = analyzeGraph(
      cycle.nodes.map((n: unknown) => AtlasNodeSchema.parse(n)),
      cycle.edges.map((e: unknown) =>
        AtlasEdgeSchema.parse({ rootCause: null, controllingRestrictionRisk: false, ...(e as object) }),
      ),
    );
    expect(d.diamondCount).toBe(1);
    expect(d.cycleCount).toBe(0);
    expect(c.cycleCount).toBe(1);
    expect(c.diamondCount).toBe(0);
  });

  it("does not keep multi-MB atlas dumps as the only git export path", () => {
    // Policy file / portable export should exist after phase2 build; mega dumps are local-only.
    expect(existsSync(join(ROOT, ".gitignore"))).toBe(true);
    const gi = readFileSync(join(ROOT, ".gitignore"), "utf-8");
    expect(gi).toContain(".local-dependency-atlas/");
  });
});
