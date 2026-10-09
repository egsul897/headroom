import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAndWrite, buildEncyclopediaCorpus, PHASE1_BASELINE_EXAMPLES } from "@/lib/definition-encyclopedia/build";
import { PHASE2_EXACT_GAP_TERMS, countExactGapHits } from "@/lib/definition-encyclopedia/phase2-terms";
import { resolveAllForwardingInDocument } from "@/lib/definition-encyclopedia/forwarding";
import { auditExtractionCompleteness } from "@/lib/definition-encyclopedia/extraction-audit";
import { auditDependencyEdges } from "@/lib/definition-encyclopedia/dependency-audit";
import { reconcileAmendmentChanges } from "@/lib/definition-encyclopedia/amendment-integrity";
import { assertIdempotentImport, buildKfImportBatch } from "@/lib/definition-encyclopedia/kf-import-adapter";
import { normalizeSecDocumentUrl } from "@/lib/definition-encyclopedia/sec-acquire";
import { ENCYCLOPEDIA_SOURCES } from "@/lib/definition-encyclopedia/sources";

const REPO_ROOT = resolve(__dirname, "../..");

describe("definition encyclopedia phase 2", () => {
  const exportDoc = buildEncyclopediaCorpus(REPO_ROOT);

  it("keeps Phase-1 baseline and expands extractable coverage without paid inference", () => {
    expect(exportDoc.definitions.length).toBeGreaterThanOrEqual(PHASE1_BASELINE_EXAMPLES);
    expect(exportDoc.generator.paidInference).toBe(false);
    expect(exportDoc.generator.mergesCertificationOrForeignSchema).toBe(false);
    expect(exportDoc.generator.version).toBe("2.0.0");
  });

  it("tracks exact gap terms separately from conceptual families", () => {
    const exact = countExactGapHits(exportDoc.definitions);
    for (const gap of PHASE2_EXACT_GAP_TERMS) {
      expect(exact).toHaveProperty(gap);
      expect(typeof exact[gap]).toBe("number");
    }
    // Conceptual family hit must not invent an exact-term hit for a different label
    const familyOnly = exportDoc.definitions.filter((d) => d.canonicalTerm === "Available Amount" && d.normalizedTerm !== "available amount");
    for (const d of familyOnly) {
      expect(d.normalizedTerm === "available equity amount").toBe(false);
    }
  });

  it("resolves forwarding definitions without allowing capacity calculation", () => {
    const chwy = ENCYCLOPEDIA_SOURCES.find((s) => s.sourceId === "chwy-2026-ca");
    expect(chwy).toBeTruthy();
    const text = readFileSync(resolve(REPO_ROOT, chwy!.retrievalPath), "utf8");
    const resolutions = resolveAllForwardingInDocument({
      text,
      documentId: chwy!.documentId,
      sourceId: chwy!.sourceId,
      agreementVersion: chwy!.agreementVersion,
    });
    expect(resolutions.length).toBeGreaterThan(0);
    for (const r of resolutions) {
      expect(r.capacityCalculationAllowed).toBe(false);
      expect(r.originalDeclarationText.length).toBeGreaterThan(0);
      expect(r.dependencyPath.length).toBeGreaterThan(0);
    }
  });

  it("audits extraction completeness on an independently sampled fixture", () => {
    const src = ENCYCLOPEDIA_SOURCES.find((s) => s.sourceId === "lsb-2023-defs")!;
    const text = readFileSync(resolve(REPO_ROOT, src.retrievalPath), "utf8");
    const audit = auditExtractionCompleteness({
      sourceId: src.sourceId,
      documentId: src.documentId,
      text,
      textSha256: "x",
    });
    expect(audit.totalDefinitionsPresent).toBeGreaterThan(0);
    expect(audit.definitionsDetected).toBeGreaterThan(0);
    expect(audit.precision).toBeGreaterThan(0.5);
    expect(audit.recall).toBeGreaterThan(0.5);
    expect(audit.inventoryMethodNote.length).toBeGreaterThan(20);
  });

  it("classifies dependency edges and does not treat all edges as direct legal deps", () => {
    const audit = auditDependencyEdges({
      definitions: exportDoc.definitions,
      edges: exportDoc.dependencyGraph.edges,
    });
    expect(audit.reportedEdgeCount).toBe(exportDoc.dependencyGraph.edges.length);
    const classified = Object.values(audit.countsByClass).reduce((a, b) => a + b, 0);
    expect(classified).toBe(audit.reportedEdgeCount);
    // At least some edges should be direct references in this corpus
    expect(audit.directReferenceCount).toBeGreaterThan(0);
  });

  it("labels amendment text changes as observations without legal-effect claims", () => {
    const records = reconcileAmendmentChanges({
      changes: exportDoc.amendmentChanges,
      definitions: exportDoc.definitions,
    });
    expect(records.length).toBe(exportDoc.amendmentChanges.length);
    for (const r of records) {
      expect(r.legalEffectClaim).toBe("NONE");
      expect(r.authorityStatus.length).toBeGreaterThan(0);
    }
  });

  it("emits an idempotent KF import adapter batch without modifying foreign schemas", () => {
    const a = buildKfImportBatch(exportDoc);
    const b = buildKfImportBatch(exportDoc);
    const replay = assertIdempotentImport(a, b);
    expect(replay.ok).toBe(true);
    expect(a.schemaCompatibility.modifiesForeignSchema).toBe(false);
    expect(a.schemaCompatibility.paidInference).toBe(false);
    expect(a.definitions.every((d) => d.verificationStatus === "SOURCE_ONLY")).toBe(true);
    expect(a.stats.definitionCount).toBe(exportDoc.definitions.length);
  });

  it("normalizes SEC ix viewer URLs to archive document URLs", () => {
    const raw = "https://www.sec.gov/ix?doc=/Archives/edgar/data/63296/000006329624000010/matw-20240131.htm";
    expect(normalizeSecDocumentUrl(raw)).toBe(
      "https://www.sec.gov/Archives/edgar/data/63296/000006329624000010/matw-20240131.htm",
    );
  });

  it("writes phase-2 audit artifacts", () => {
    const written = buildAndWrite(REPO_ROOT);
    expect(written.phase2Summary.importReplayOk).toBe(true);
    for (const name of [
      "forwarding-resolutions.json",
      "extraction-audit.json",
      "dependency-edge-audit.json",
      "amendment-integrity.json",
      "kf-import-batch.json",
      "phase2-summary.json",
      "corpus-manifest.json",
      "PHASE2-REPORT.md",
    ]) {
      expect(existsSync(resolve(REPO_ROOT, "docs/definition-encyclopedia", name))).toBe(true);
    }
  });
});
