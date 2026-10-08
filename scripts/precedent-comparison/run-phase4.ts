/**
 * Phase 4 harness: context audit, false-diff remediation metrics, Phase 4 eval, CKF probe.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { importCkfExportIntoCorpus, probeCkfExportMount } from "../../lib/precedent-comparison/adapters/ckf-import";
import { aggregateMetrics, evaluateScenario, runBenchmarkSuite } from "../../lib/precedent-comparison/benchmark/evaluate";
import { ALL_PHASE4_SCENARIOS, phase4ScenarioCounts } from "../../lib/precedent-comparison/benchmark/phase4-scenarios";
import { getDefaultCorpus } from "../../lib/precedent-comparison/corpus";
import { auditContextIncompleteness } from "../../lib/precedent-comparison/context-assembly";
import { auditCorpus } from "../../lib/precedent-comparison/validation/corpus-audit";

function main(): void {
  const root = process.cwd();
  const outDir = join(root, "docs/precedent-comparison");
  mkdirSync(outDir, { recursive: true });

  const corpus = getDefaultCorpus();
  const spanAudit = auditCorpus(corpus, root, 100);
  const contextAudit = auditContextIncompleteness(corpus, 100, root);

  const phase3 = runBenchmarkSuite(root);
  const phase4Evals = ALL_PHASE4_SCENARIOS.map((s) => evaluateScenario(s, root));
  const phase4Metrics = {
    all: aggregateMetrics(phase4Evals, "ALL"),
    dev: aggregateMetrics(phase4Evals, "DEV"),
    heldOut: aggregateMetrics(phase4Evals, "HELD_OUT"),
  };

  const ckfProbe = probeCkfExportMount(root);
  const ckfImport = importCkfExportIntoCorpus(root, { write: false });

  const dispositions = {
    D18: {
      rootCause: "Regex ECONOMICS treated '4.00 to 1.00' and '4.00:1.00' as distinct thresholds (unsupported legal-effect from orthography).",
      disposition: "FIXED — ratio-format normalization before threshold compare; positive control 4.00 vs 3.50 retained.",
    },
    D28: {
      rootCause: "ORDINARY_COURSE feature regex required whitespace; missed hyphenated 'ordinary-course' → false STRUCTURE divergence.",
      disposition: "FIXED — accept ordinary[\\s-]+course; positive control without ordinary-course retained.",
    },
    H02: {
      rootCause: "Borrower naming on one side elevated BORROWER_SCOPE as SOURCE_SUPPORTED SCOPE/STRUCTURE; Borrower is default obligor.",
      disposition: "FIXED — borrower-only asymmetry → SEMANTIC_HYPOTHESIS; Restricted Subsidiary/Guarantor asymmetries still elevate.",
    },
  };

  const payload = {
    schemaVersion: "precedent-comparison-phase4.v1",
    generatedAt: new Date().toISOString(),
    startingHead: "86cb255cd0737f94a0fc27766a35657310da8001",
    phase3CodeSha: "9f2ba8cfe86be3feb2bda8f1280f2dd3c65ba1b9",
    contextCompleteness: {
      beforeAssemblyIncomplete: contextAudit.incompleteBeforeAssembly,
      afterAssemblyIncomplete: contextAudit.incompleteAfterAssembly,
      sampleSize: contextAudit.sampleSize,
      byKind: contextAudit.byKind,
      resolvedByPeer: contextAudit.resolvedByPeer,
      spanExactMatchRate: spanAudit.spanAudit.exactMatchRate,
      spanContextCompletenessRate: spanAudit.spanAudit.contextCompletenessRate,
    },
    falseLegalDifferenceDispositions: dispositions,
    phase3MetricsAfterRemediation: phase3.metrics,
    phase3FalseFindingsAfter: phase3.falseLegalDifferenceFindings.map((f) => f.scenarioId),
    phase4ScenarioCounts: phase4ScenarioCounts(),
    phase4Metrics,
    ckf: { probe: ckfProbe, import: ckfImport },
    authenticDocumentsAdded: 0,
    costsUsd: 0,
    limitations: [
      "Peer Atlas/DEF/ACR/FDP exports are largely unmounted in this worktree — assembly often cannot close definitions/cross-docs.",
      "CKF has acquired SEC documents on its branch but published provision corpus export is not mounted here.",
      "Context completeness heuristics are not full legal dependency closure.",
      "No legal certification; SOURCE_SUPPORTED ≠ REVIEWER_VERIFIED.",
    ],
  };

  writeFileSync(join(outDir, "phase-4-results.json"), JSON.stringify(payload, null, 2) + "\n");
  console.log(JSON.stringify({
    contextBefore: contextAudit.incompleteBeforeAssembly,
    contextAfter: contextAudit.incompleteAfterAssembly,
    phase3HeldOutFalse: phase3.metrics.heldOut.falseMaterialDifferenceCount,
    phase3FalseIds: phase3.falseLegalDifferenceFindings.map((f) => f.scenarioId),
    phase4HeldOut: phase4Metrics.heldOut,
    ckfMounted: ckfProbe.mounted,
    ckfImported: ckfImport.imported,
  }, null, 2));
}

main();
