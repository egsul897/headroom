import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCkfCanonicalIntegration } from "../../scripts/covenant-dependency-atlas/ckf-canonical-integration";
import { buildFixtureCorpusRegistry } from "../../scripts/covenant-dependency-atlas/corpus-registry";
import { extractFromStructural, loadTextDocument } from "../../scripts/covenant-dependency-atlas/extract-from-structural";
import { runIndependentPrecisionAudit } from "../../scripts/covenant-dependency-atlas/independent-precision-audit";
import { runLegalSafetyProbes } from "../../scripts/covenant-dependency-atlas/legal-safety-probes";
import { measureRecallCorrected, measureRecallPhase3Harness } from "../../scripts/covenant-dependency-atlas/measure-recall";

const ROOT = join(__dirname, "../..");
const FROZEN = join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json");

describe("Dependency Atlas Phase 4", () => {
  it("keeps the Phase-3 135-edge benchmark frozen at 135 edges", () => {
    const gt = JSON.parse(readFileSync(FROZEN, "utf-8")) as { edges: unknown[] };
    expect(gt.edges).toHaveLength(135);
  });

  it("emits fail-closed UNRESOLVED COVENANT_TO_DEFINITION for Indebtedness in neg-covenant excerpts without local defs", () => {
    const path = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt";
    const doc = extractFromStructural({
      documentId: "lsb-art6",
      packageId: "lsb-2023",
      sourceFile: path,
      label: "lsb",
      text: loadTextDocument(join(ROOT, path)),
      split: "development",
      issuer: "LSB",
    });
    const hit = doc.edges.find(
      (e) =>
        e.kind === "COVENANT_TO_DEFINITION" &&
        e.resolution === "UNRESOLVED" &&
        /Indebtedness/i.test(e.rationale) &&
        e.rootCause === "MISSING_DEFINITION",
    );
    expect(hit).toBeTruthy();
    expect(hit!.controllingRestrictionRisk).toBe(true);
  });

  it("corrected recall harness does not use toLabel as a term identity key", () => {
    const gt = JSON.parse(readFileSync(FROZEN, "utf-8")) as {
      edges: Array<{
        edgeId: string;
        documentId: string;
        split: "development" | "evaluation" | "blind";
        kind: string;
        toLabel?: string;
        termName?: string;
      }>;
    };
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
    const chwyExpected = gt.edges.filter((e) => e.documentId === "chwy-doc-a");
    const legacy = measureRecallPhase3Harness([doc], chwyExpected);
    const corrected = measureRecallCorrected([doc], chwyExpected);
    expect(corrected.overall.truePositives).toBeGreaterThanOrEqual(legacy.overall.truePositives);
  });

  it("legal-safety probes never yield affirmative permission", () => {
    const path = "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt";
    const doc = extractFromStructural({
      documentId: "fwrg-art6",
      packageId: "fwrg-2021",
      sourceFile: path,
      label: "fwrg",
      text: loadTextDocument(join(ROOT, path)),
      split: "development",
      issuer: "FWRG",
    });
    const report = runLegalSafetyProbes([doc]);
    expect(report.affirmativePermissionCount).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.probes.length).toBeGreaterThan(0);
  });

  it("independent precision audit returns stratified verdicts", () => {
    const path = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt";
    const doc = extractFromStructural({
      documentId: "lsb-defs",
      packageId: "lsb-2023",
      sourceFile: path,
      label: "lsb-defs",
      text: loadTextDocument(join(ROOT, path)),
      split: "development",
      issuer: "LSB",
    });
    const audit = runIndependentPrecisionAudit([doc]);
    expect(audit.sampleSize).toBeGreaterThan(0);
    expect(Object.values(audit.byVerdict).reduce((a, b) => a + b, 0)).toBe(audit.sampleSize);
    expect(audit.negativeExamplesPreserved.some((p) => p.includes("independent-ground-truth-phase3.json"))).toBe(true);
  });

  it("reports CKF 113-corpus blocker rather than inventing integration", () => {
    const report = validateCkfCanonicalIntegration();
    expect(report.competingSourceRegistryCreated).toBe(false);
    expect(report.promotedToLegalTruth === null || report.promotedToLegalTruth === 0).toBe(true);
    if (!report.claimed113CorpusAccessible) {
      expect(report.status).toBe("BLOCKED");
      expect(report.infrastructureBlocker).toBeTruthy();
    }
  });

  it("does not register Knife River body in corpus", () => {
    const registry = buildFixtureCorpusRegistry();
    expect(registry.every((e) => !/knife|knf/i.test(e.documentId + e.sourcePath))).toBe(true);
    expect(existsSync(join(ROOT, "docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md"))).toBe(true);
  });
});
