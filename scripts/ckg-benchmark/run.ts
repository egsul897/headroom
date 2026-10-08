#!/usr/bin/env tsx
/**
 * Reproducible Covenant Knowledge Generalization benchmark runner.
 *
 * Offline only. Zero paid calls. Does not modify Claude-owned acceptance
 * fixtures, production prompts, extraction rules, or certification status.
 *
 * Usage:
 *   npx tsx scripts/ckg-benchmark/run.ts
 *   npx tsx scripts/ckg-benchmark/run.ts --json-only
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  aggregateMetrics,
  costPerSourceVerified,
  loadCases,
  loadCandidates,
  loadPackages,
  loadProtocol,
  runBenchmark,
  stratify,
  type BenchmarkReport,
  type MetricId,
} from "../../lib/evaluation/ckg-benchmark";

const ALL_METRICS: MetricId[] = [
  "covenant_family_discovery_recall",
  "definition_extraction_accuracy",
  "cross_reference_accuracy",
  "condition_recall",
  "exception_recall",
  "entity_scope_accuracy",
  "amendment_reconstruction",
  "shared_capacity_recognition",
  "comparator_correctness",
  "false_permission_rate",
  "unsupported_semantic_refusal",
  "provenance_accuracy",
  "unseen_document_performance",
  "cost_per_source_verified_representation",
];

function git(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function main() {
  const jsonOnly = process.argv.includes("--json-only");
  const cases = loadCases();
  const candidates = loadCandidates();
  const protocol = loadProtocol();
  const packages = loadPackages();

  const caseResults = runBenchmark(cases, candidates);
  const metrics = aggregateMetrics(caseResults);
  // Ensure every required metric appears even if empty.
  for (const m of ALL_METRICS) {
    if (!metrics.some((x) => x.metric === m)) {
      metrics.push({
        metric: m,
        evaluated: 0,
        success: 0,
        failure: 0,
        unlabeled: 0,
        notEvaluated: 0,
        rate: null,
        lowerIsBetter: m === "false_permission_rate",
        costUsdOnSourceVerifiedSuccesses: 0,
        sourceVerifiedSuccesses: 0,
      });
    }
  }
  metrics.sort((a, b) => a.metric.localeCompare(b.metric));

  const stratified = stratify(caseResults);
  const cpsvr = costPerSourceVerified(caseResults);

  const outstandingGaps: string[] = [
    "Deep §7.01(b) Indebtedness basket inventory on Gibraltar remains UNLABELED.",
    "Gibraltar §7.08 Qualifying Material Acquisition condition extraction has no Pass B output (NOT_EVALUATED) — requires unpaid deterministic or separately authorized paid semantic pass.",
    "Knife River BLIND body remains unread; reserved UNLABELED synthetic slot only.",
    "Superior formerly-unseen package is permanent regression evidence (invariant 28) — cannot again support a blind generalization claim.",
    "False-permission and unsupported-semantic rates currently rest on REVIEWER_APPROVED synthetic controls, not yet on adjudicated held-out public clauses at scale.",
    "Cost-per-source-verified is $0.00 by construction for this unpaid offline run; it does not yet measure live compilation economics on held-out packages.",
    "No human legal-counsel sign-off on Gibraltar SOURCE_VERIFIED labels yet — posture matches prior Headroom independent-GT disclosures.",
  ];

  const report: BenchmarkReport = {
    schemaVersion: "ckg-benchmark.v1",
    generatedAt: new Date().toISOString(),
    headSha: git("git rev-parse HEAD"),
    branch: git("git rev-parse --abbrev-ref HEAD"),
    paidCalls: 0,
    dataset: {
      packageCount: Array.isArray((packages as { packages?: unknown[] }).packages)
        ? ((packages as { packages: unknown[] }).packages.length)
        : 0,
      caseCount: cases.length,
      labeledCaseCount: cases.filter((c) => c.expected.authority !== "UNLABELED").length,
      unlabeledCaseCount: cases.filter((c) => c.expected.authority === "UNLABELED").length,
    },
    metrics,
    stratified,
    caseResults,
    costPerSourceVerifiedRepresentationUsd: cpsvr,
    outstandingGaps,
    reproducibleCommands: [
      "npx tsx scripts/ckg-benchmark/run.ts",
      "npx tsx scripts/ckg-benchmark/run.ts --json-only",
      "npx vitest run tests/covenant-knowledge-generalization/",
    ],
  };

  const outDir = path.join(process.cwd(), "docs/covenant-knowledge-generalization-benchmark");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "02-evaluation-results.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "01-dataset-manifest.json"),
    JSON.stringify(
      {
        protocol,
        packages,
        caseIds: cases.map((c) => ({
          caseId: c.caseId,
          metric: c.metric,
          authority: c.expected.authority,
          issuer: c.strata.issuer,
          agreementType: c.strata.agreementType,
          covenantFamily: c.strata.covenantFamily,
          draftingComplexity: c.strata.draftingComplexity,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(
    path.join(outDir, "03-stratified-results.json"),
    JSON.stringify({ generatedAt: report.generatedAt, stratified }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(outDir, "04-outstanding-gaps.json"),
    JSON.stringify({ generatedAt: report.generatedAt, outstandingGaps }, null, 2) + "\n",
  );

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  console.log("CKG Benchmark — offline evaluation");
  console.log(`SHA: ${report.headSha}`);
  console.log(`Branch: ${report.branch}`);
  console.log(`Paid calls: ${report.paidCalls}`);
  console.log(
    `Cases: ${report.dataset.caseCount} (labeled ${report.dataset.labeledCaseCount}, unlabeled ${report.dataset.unlabeledCaseCount})`,
  );
  console.log("");
  console.log("Metrics:");
  for (const m of metrics) {
    const rate =
      m.rate === null ? "n/a" : m.lowerIsBetter ? `${(m.rate * 100).toFixed(1)}% (lower better)` : `${(m.rate * 100).toFixed(1)}%`;
    console.log(
      `  ${m.metric}: success=${m.success} failure=${m.failure} unlabeled=${m.unlabeled} not_eval=${m.notEvaluated} rate=${rate}`,
    );
  }
  console.log("");
  console.log(
    `Cost per SOURCE_VERIFIED success: ${
      cpsvr === null ? "n/a" : `$${cpsvr.toFixed(4)}`
    }`,
  );
  console.log("");
  console.log("Wrote docs/covenant-knowledge-generalization-benchmark/{01,02,03,04}-*.json");
}

main();
