/**
 * Run Agent 5 authentic cross-document scenarios and emit a JSON summary.
 * Zero provider spend.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runAllCrossDocumentScenarios } from "../../lib/product/covenant-intelligence/cross-document-scenarios";

const outDir = process.argv[2] ?? "docs/cross-document-covenant-reasoning";
mkdirSync(outDir, { recursive: true });

const suite = runAllCrossDocumentScenarios();
const payload = {
  schema: "cross-document-covenant-scenarios.v1",
  generatedAt: new Date().toISOString(),
  costUsd: 0,
  total: suite.total,
  matchedCount: suite.matchedCount,
  falsePermissionCount: suite.falsePermissionCount,
  results: suite.results.map((r) => ({
    scenarioId: r.scenarioId,
    title: r.title,
    expectedOverall: r.expectedOverall,
    actualOverall: r.actualOverall,
    matchesExpected: r.matchesExpected,
    applicableDocuments: r.verdict.applicableDocuments,
    governingSections: r.verdict.governingSections.map((c) => ({
      documentId: c.documentId,
      sectionRef: c.sectionRef,
      excerpt: c.excerpt.slice(0, 160),
    })),
    evaluatedRestrictions: r.verdict.evaluatedRestrictions.map((x) => ({
      family: x.family,
      documentId: x.documentId,
      sectionRef: x.sectionRef,
      stance: x.stance,
    })),
    conditions: r.verdict.conditions,
    supportedPermissions: r.verdict.supportedPermissions,
    prohibitions: r.verdict.prohibitions,
    unknowns: r.verdict.unknowns,
    overallResult: r.verdict.overallResult,
    exactSourceCitations: r.verdict.exactSourceCitations.map((c) => `${c.documentLabel} §${c.sectionRef}`),
    contractualPathways: r.verdict.contractualPathways,
    antiStackingNotes: r.verdict.antiStackingNotes,
    falsePermissionRisks: r.verdict.falsePermissionRisks,
    systemsConsumed: r.verdict.systemsConsumed,
    independentVerification: r.independentVerification,
  })),
};

const outPath = join(outDir, "scenario-results.json");
writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(
  JSON.stringify(
    {
      outPath,
      matchedCount: suite.matchedCount,
      total: suite.total,
      falsePermissionCount: suite.falsePermissionCount,
      costUsd: 0,
    },
    null,
    2,
  ),
);

if (suite.matchedCount !== suite.total || suite.falsePermissionCount !== 0) {
  process.exitCode = 1;
}
