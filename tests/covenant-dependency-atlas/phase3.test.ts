import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adjudicateCycles } from "../../scripts/covenant-dependency-atlas/adjudicate-cycles";
import { analyzeControllingRisks } from "../../scripts/covenant-dependency-atlas/analyze-controlling-risks";
import { analyzeMissingDefinitions } from "../../scripts/covenant-dependency-atlas/analyze-definitions";
import { authorIndependentGroundTruth } from "../../scripts/covenant-dependency-atlas/author-independent-gt";
import { buildAtlasDataset } from "../../scripts/covenant-dependency-atlas/build-atlas";
import { runCkfImportDemo } from "../../scripts/covenant-dependency-atlas/ckf-import-demo";
import { buildFixtureCorpusRegistry, corpusSummary } from "../../scripts/covenant-dependency-atlas/corpus-registry";
import { extractFromStructural, loadTextDocument } from "../../scripts/covenant-dependency-atlas/extract-from-structural";
import { toKnowledgeFactoryExport } from "../../scripts/covenant-dependency-atlas/export-kf";

const ROOT = join(__dirname, "../..");

describe("Dependency Atlas Phase 3", () => {
  it("fixes CHWY Total Leverage Ratio → Consolidated EBITDA via Atlas definition-body window", () => {
    const path = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
    const doc = extractFromStructural({
      documentId: "chwy-doc-a",
      packageId: "chwy-2026",
      sourceFile: path,
      label: "chwy",
      text: loadTextDocument(join(ROOT, path)),
      split: "development",
      issuer: "CHWY",
    });
    expect(
      doc.edges.some(
        (e) =>
          e.kind === "RATIO_CALCULATION" &&
          /Total Leverage Ratio/i.test(e.rationale) &&
          /Consolidated EBITDA/i.test(e.rationale),
      ),
    ).toBe(true);
  });

  it("extracts RIOT LTV / Collateral Documents families from source-true terms", () => {
    const path = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt";
    const doc = extractFromStructural({
      documentId: "riot-doc-a",
      packageId: "riot-2025-2026",
      sourceFile: path,
      label: "riot",
      text: loadTextDocument(join(ROOT, path)),
      split: "development",
      issuer: "RIOT",
    });
    expect(doc.edges.some((e) => e.kind === "RATIO_CALCULATION" && /Actual LTV Ratio/i.test(e.rationale))).toBe(true);
    expect(doc.edges.some((e) => e.kind === "COVENANT_TO_CROSS_DOCUMENT")).toBe(true);
    expect(doc.edges.some((e) => e.kind === "COVENANT_TO_DEFINITION" && /Collateral/i.test(e.rationale))).toBe(true);
  });

  it("authors >=100 independent GT edges with development/evaluation/blind splits", () => {
    const result = authorIndependentGroundTruth();
    expect(result.totals.edges).toBeGreaterThanOrEqual(100);
    expect(result.totals.bySplit.development).toBeGreaterThan(0);
    expect(result.totals.bySplit.evaluation).toBeGreaterThan(0);
    expect(result.totals.bySplit.blind).toBeGreaterThan(0);
    const payload = JSON.parse(readFileSync(result.path, "utf-8")) as {
      edges: { authoredFrom: string; sourceSpan: { excerpt: string } }[];
      knifeRiverBlind: string;
    };
    expect(payload.edges.every((e) => e.authoredFrom === "SOURCE_TEXT_SPAN")).toBe(true);
    expect(payload.edges.every((e) => e.sourceSpan.excerpt.length > 0)).toBe(true);
    expect(payload.knifeRiverBlind).toMatch(/PRESERVED_UNREAD/);
  });

  it("classifies controlling-restriction risks into defect cards without inventing targets", () => {
    const dataset = buildAtlasDataset("2026-10-08T23:00:00.000Z");
    const edges = dataset.packages.flatMap((p) => p.documents.flatMap((d) => d.edges));
    const report = analyzeControllingRisks(edges);
    expect(report.totalOpenControllingRisks).toBeGreaterThan(0);
    expect(report.defectCards.length).toBe(report.totalOpenControllingRisks);
    expect(report.defectCards.every((c) => c.doNotInfer.includes("Do not invent"))).toBe(true);
    expect(report.defectCards.every((c) => c.evidenceExcerpt != null || c.unresolvedReason != null)).toBe(true);
  });

  it("subtypes MISSING_DEFINITION cases for encyclopedia/compiler coordination", () => {
    const dataset = buildAtlasDataset("2026-10-08T23:00:00.000Z");
    const edges = dataset.packages.flatMap((p) => p.documents.flatMap((d) => d.edges));
    const nodes = dataset.packages.flatMap((p) => p.documents.flatMap((d) => d.nodes));
    const report = analyzeMissingDefinitions(edges, nodes);
    expect(report.totalMissingDefinition).toBeGreaterThan(0);
    const sum = Object.values(report.bySubtype).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.totalMissingDefinition);
    expect(report.coordinationNotes.length).toBeGreaterThan(0);
  });

  it("adjudicates cycles and preserves diamonds as acyclic", () => {
    const dataset = buildAtlasDataset("2026-10-08T23:00:00.000Z");
    const report = adjudicateCycles(dataset);
    expect(report.cycleCount).toBe(dataset.totals.cycles);
    expect(report.counts.DIAMOND_SHARED_DEPENDENCY_ACYCLIC).toBe(report.diamondCountSampled);
    expect(report.diamondProof).toMatch(/none were also classified as cycles/i);
    const textual = report.adjudications.filter((a) => a.adjudication === "TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION");
    const artifact = report.adjudications.filter((a) => a.adjudication === "STRUCTURAL_EXTRACTION_ARTIFACT");
    const genuine = report.adjudications.filter((a) => a.adjudication === "GENUINE_SEMANTIC_DEPENDENCY_CYCLE");
    expect(textual.length).toBeGreaterThanOrEqual(5);
    expect(artifact.length).toBeGreaterThanOrEqual(1);
    expect(genuine.length).toBeGreaterThanOrEqual(1);
  });

  it("demonstrates idempotent CKF import preserving unresolved edges", () => {
    const dataset = buildAtlasDataset("2026-10-08T23:00:00.000Z");
    const kf = toKnowledgeFactoryExport(dataset);
    const local = join(ROOT, ".local-dependency-atlas/exports");
    const path = join(local, "gt-knowledge-factory-dataset.json");
    mkdirSync(local, { recursive: true });
    writeFileSync(path, `${JSON.stringify(kf)}\n`);
    const demo = runCkfImportDemo(path);
    expect(demo.pass1.status).toBe("OK");
    expect(demo.pass2.idempotent).toBe(true);
    expect(demo.pass2.promotedToLegalTruth).toBe(0);
    expect(demo.pass2.unresolvedPreserved).toBeGreaterThan(0);
    expect(demo.pass1.sourceVersionId).toBe(demo.pass2.sourceVersionId);
  });

  it("documents Gibraltar development reclassification and Knife River BLIND", () => {
    const summary = corpusSummary(buildFixtureCorpusRegistry());
    expect(summary.holdoutIntegrity?.gibraltarSplit).toBe("development");
    expect(summary.holdoutIntegrity?.knifeRiverBlind).toMatch(/PRESERVED_UNREAD/);
    expect(summary.holdoutIntegrity?.evaluationPackage).toBe("cnmd-htm-amd2");
    expect(existsSync(join(ROOT, "docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md"))).toBe(true);
  });
});
