import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAtlasDataset, writeAtlasArtifacts } from "../../scripts/covenant-dependency-atlas/build-atlas";
import { toKnowledgeFactoryExport } from "../../scripts/covenant-dependency-atlas/export-kf";
import {
  ATLAS_SCHEMA_VERSION,
  DEPENDENCY_EDGE_KINDS,
  KnowledgeFactoryExportSchema,
  KF_EXPORT_SCHEMA_VERSION,
} from "../../scripts/covenant-dependency-atlas/schema";

describe("Covenant Dependency Atlas dataset build", () => {
  const dataset = buildAtlasDataset("2026-10-08T00:00:00.000Z");

  it("builds a schema-valid dataset without paid inference or resolver touches", () => {
    expect(dataset.schemaVersion).toBe(ATLAS_SCHEMA_VERSION);
    expect(dataset.paidInference).toBe(false);
    expect(dataset.productionResolverTouched).toBe(false);
    expect(dataset.packages).toHaveLength(1);
    expect(dataset.packages[0]!.documents.map((d) => d.documentId).sort()).toEqual([
      "doc-a",
      "doc-b",
      "doc-c",
      "doc-d",
    ]);
    expect(dataset.totals.edges).toBeGreaterThan(0);
    expect(dataset.totals.nodes).toBeGreaterThan(0);
    expect(dataset.totals.uniqueNodes).toBeLessThanOrEqual(dataset.totals.nodes);
    expect(dataset.nodeIdentity?.silentDataLoss).toBe(false);
  });

  it("covers every required dependency edge kind somewhere in the package OR records an explicit gap", () => {
    const kindsPresent = new Set(dataset.packages[0]!.documents.flatMap((d) => d.edges.map((e) => e.kind)));
    const gaps = dataset.packages[0]!.documents.flatMap((d) => d.completeness.gaps);
    for (const kind of DEPENDENCY_EDGE_KINDS) {
      const present = kindsPresent.has(kind);
      const gapNamed = gaps.some((g) => g.startsWith(`${kind}:`) || g.includes(`${kind}:`));
      expect(present || gapNamed, `${kind} must appear as an edge or an explicit completeness gap`).toBe(true);
    }
  });

  it("preserves unresolved / ambiguous relationships rather than dropping them", () => {
    expect(dataset.totals.unresolved + dataset.totals.ambiguous).toBeGreaterThan(0);
    const unresolved = dataset.packages[0]!.documents
      .flatMap((d) => d.edges)
      .filter((e) => e.resolution !== "RESOLVED");
    expect(unresolved.every((e) => e.unresolvedReason || e.resolution === "AMBIGUOUS")).toBe(true);
  });

  it("never admits an edge with a similarity-only evidence class", () => {
    const forbidden = new Set(["STRING_SIMILARITY", "TERM_CO_OCCURRENCE", "TEXTUAL_SIMILARITY"]);
    for (const e of dataset.packages[0]!.documents.flatMap((d) => d.edges)) {
      expect(forbidden.has(e.evidenceClass)).toBe(false);
      expect(e.rationale.toLowerCase()).not.toMatch(/similarit(y|ies) alone|looks like|fuzzy match/);
    }
  });

  it("detects at least one shared-basket diamond on doc-a (Available Amount)", () => {
    const docA = dataset.packages[0]!.documents.find((d) => d.documentId === "doc-a")!;
    const shared = docA.edges.filter((e) => e.kind === "COVENANT_TO_SHARED_BASKET" && e.sharedBasketKey === "Available Amount");
    expect(shared.length).toBeGreaterThanOrEqual(2);
    expect(docA.motifs.some((m) => m.motifType === "DIAMOND_SHARED_DEPENDENCY")).toBe(true);
  });

  it("emits a knowledge-factory compatible export with safety flags", () => {
    const kf = KnowledgeFactoryExportSchema.parse(toKnowledgeFactoryExport(dataset));
    expect(kf.schemaVersion).toBe(KF_EXPORT_SCHEMA_VERSION);
    expect(kf.paidInference).toBe(false);
    expect(kf.merges).toBe(false);
    expect(kf.certificationChanges).toBe(false);
    expect(kf.productionResolverTouched).toBe(false);
    expect(kf.counts.edges).toBe(kf.edges.length);
    expect(kf.unresolvedRelationships.length).toBe(kf.counts.unresolved + kf.counts.ambiguous);
  });

  it("writes export artifacts and per-document completeness reports", () => {
    const paths = writeAtlasArtifacts(dataset);
    expect(existsSync(paths.atlasPath)).toBe(true);
    expect(existsSync(paths.kfPath)).toBe(true);
    expect(existsSync(paths.summaryPath)).toBe(true);
    expect(paths.completenessPaths.length).toBe(4);
    for (const p of paths.completenessPaths) expect(existsSync(p)).toBe(true);
    const summary = JSON.parse(readFileSync(paths.summaryPath, "utf-8")) as {
      totals: { edges: number };
      unresolvedRelationshipCount: number;
    };
    expect(summary.totals.edges).toBe(dataset.totals.edges);
    expect(summary.unresolvedRelationshipCount).toBeGreaterThan(0);
  });

  it("does not import production dependency resolver modules (static path guard)", () => {
    const forbidden = [
      "lib/contract-model/runtime/dependency-graph",
      "lib/contract-model/compiler/semantic/required-dependencies",
      "lib/contract-model/compiler/stage-dependency-resolution",
      "lib/contract-model/covenant-map/package-dependencies",
    ];
    const atlasSources = [
      join(__dirname, "../../scripts/covenant-dependency-atlas/build-atlas.ts"),
      join(__dirname, "../../scripts/covenant-dependency-atlas/extract-from-ground-truth.ts"),
      join(__dirname, "../../scripts/covenant-dependency-atlas/extract-from-structural.ts"),
      join(__dirname, "../../scripts/covenant-dependency-atlas/graph-analysis.ts"),
      join(__dirname, "../../scripts/covenant-dependency-atlas/export-kf.ts"),
      join(__dirname, "../../scripts/covenant-dependency-atlas/completeness.ts"),
      join(__dirname, "../../scripts/covenant-dependency-atlas/schema.ts"),
    ];
    for (const src of atlasSources) {
      const text = readFileSync(src, "utf-8");
      for (const prod of forbidden) {
        expect(text.includes(prod)).toBe(false);
      }
    }
    // Structural adapter may read-only import parse/detect APIs — never the resolver.
    const structural = readFileSync(
      join(__dirname, "../../scripts/covenant-dependency-atlas/extract-from-structural.ts"),
      "utf-8",
    );
    expect(structural).toMatch(/parseDocumentStructure/);
    expect(structural).not.toMatch(/required-dependencies|dependency-graph|stage-dependency-resolution/);
  });
});
