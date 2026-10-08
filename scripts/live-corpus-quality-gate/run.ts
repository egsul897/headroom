#!/usr/bin/env tsx
/**
 * Live Corpus Quality Gate runner — authentic EDGAR sample only.
 * Offline, unpaid. Does not modify Claude-owned fixtures, production
 * legal rules, or certification status.
 *
 *   npx tsx scripts/live-corpus-quality-gate/run.ts
 *   npm run live-corpus-quality-gate
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  auditGibraltar,
  auditSuperior,
  rollupStatus,
  type LiveCorpusQualityReport,
  type ProductionDefect,
} from "../../lib/evaluation/live-corpus-quality-gate";

function git(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function main() {
  const gib = auditGibraltar();
  const sup = auditSuperior();
  const findings = [...gib.findings, ...sup.findings];
  const defects = [...gib.defects, ...sup.defects].sort((a, b) => {
    const rank: Record<ProductionDefect["severity"], number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    return rank[a.severity] - rank[b.severity];
  });

  const { layerSummaries, dimensionRollup } = rollupStatus(findings);
  const hasFail = findings.some((f) => f.status === "FAIL") || defects.length > 0;

  const outstandingGaps = [
    "Exhaustive Gibraltar Article I definition inventory lacks independent counsel GT (spot-checks only).",
    "Gibraltar Pass B/C/D semantic extraction never ran — condition/exception IR population UNVERIFIED.",
    "Superior definition/condition/entity dimensions marked UNVERIFIED for fresh legal verification in this unpaid gate.",
    "Knife River BLIND body remains unread and is excluded from the sample.",
    "False-affirmative capacity legally verified rate cannot be computed without certified capacity answers on DEVELOPMENT package.",
    "No production legal rules or certification status were changed by this gate.",
  ];

  const report: LiveCorpusQualityReport = {
    schemaVersion: "live-corpus-quality-gate.v1",
    generatedAt: new Date().toISOString(),
    headSha: git("git rev-parse HEAD"),
    branch: git("git rev-parse --abbrev-ref HEAD"),
    paidCalls: 0,
    certificationImpact: "NONE",
    claudeOwnedFixturesModified: false,
    productionLegalRulesModified: false,
    firstRealEdgarBatch: "gibraltar-2026-credit-agreement",
    sampleIds: ["gib-doc-a", "sup-doc-a", "sup-doc-b", "sup-doc-c"],
    authenticDocumentCount: 4,
    syntheticDocumentCount: 0,
    findings,
    layerSummaries,
    dimensionRollup,
    highestRiskOmissions: defects,
    outstandingGaps,
    reproducibleCommands: [
      "npm run live-corpus-quality-gate",
      "npx tsx scripts/live-corpus-quality-gate/run.ts",
      "npx vitest run tests/live-corpus-quality-gate/",
    ],
    gateVerdict: hasFail
      ? "LIVE_CORPUS_QUALITY_GATE_RECORDED_WITH_DEFECTS"
      : "LIVE_CORPUS_QUALITY_GATE_ALL_PASS",
  };

  const outDir = path.join(ROOT_OUT());
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = fs.readFileSync(
    path.join(process.cwd(), "tests/fixtures/live-corpus-quality-gate/sample-manifest.json"),
    "utf8",
  );
  fs.writeFileSync(path.join(outDir, "00-sample-manifest.json"), manifest);
  fs.writeFileSync(path.join(outDir, "01-findings.json"), JSON.stringify({ findings }, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "02-layer-summaries.json"),
    JSON.stringify({ layerSummaries, dimensionRollup }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(outDir, "03-production-defects.json"),
    JSON.stringify({ highestRiskOmissions: defects }, null, 2) + "\n",
  );
  fs.writeFileSync(path.join(outDir, "04-quality-gate-report.json"), JSON.stringify(report, null, 2) + "\n");

  const md = renderMarkdown(report);
  fs.writeFileSync(path.join(outDir, "REPORT.md"), md);

  console.log(`Live Corpus Quality Gate — ${report.gateVerdict}`);
  console.log(`SHA: ${report.headSha}`);
  console.log(`Authentic docs: ${report.authenticDocumentCount} | Synthetic: ${report.syntheticDocumentCount}`);
  console.log(`Findings: ${findings.length} (PASS ${findings.filter((f) => f.status === "PASS").length} / FAIL ${findings.filter((f) => f.status === "FAIL").length} / UNVERIFIED ${findings.filter((f) => f.status === "UNVERIFIED").length})`);
  console.log(`Production defects returned: ${defects.length}`);
  for (const d of defects) {
    console.log(`  [${d.severity}] ${d.defectId}: ${d.title}`);
  }
  console.log("");
  console.log("Layer separation:");
  for (const l of layerSummaries) {
    console.log(`  ${l.layer}: PASS=${l.pass} FAIL=${l.fail} UNVERIFIED=${l.unverified}`);
  }
  console.log(`Wrote ${outDir}`);
}

function ROOT_OUT() {
  return path.join(process.cwd(), "docs/live-corpus-quality-gate");
}

function renderMarkdown(report: LiveCorpusQualityReport): string {
  const lines: string[] = [];
  lines.push("# Live Corpus Quality Gate — Report");
  lines.push("");
  lines.push(`**Verdict:** \`${report.gateVerdict}\``);
  lines.push("");
  lines.push(`**Head SHA (at generation):** \`${report.headSha}\``);
  lines.push(`**Branch:** \`${report.branch}\``);
  lines.push(`**Paid calls:** \`${report.paidCalls}\``);
  lines.push(`**Certification impact:** \`${report.certificationImpact}\``);
  lines.push(`**Claude-owned fixtures modified:** \`${report.claudeOwnedFixturesModified}\``);
  lines.push(`**Production legal rules modified:** \`${report.productionLegalRulesModified}\``);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`First real EDGAR batch: **${report.firstRealEdgarBatch}**`);
  lines.push(`Stratified authentic sample: ${report.sampleIds.join(", ")}`);
  lines.push(`Authentic documents: ${report.authenticDocumentCount} | Synthetic: ${report.syntheticDocumentCount}`);
  lines.push("");
  lines.push("## Layer separation (do not collapse)");
  lines.push("");
  lines.push("| Layer | PASS | FAIL | UNVERIFIED |");
  lines.push("|---|---:|---:|---:|");
  for (const l of report.layerSummaries) {
    lines.push(`| ${l.layer} | ${l.pass} | ${l.fail} | ${l.unverified} |`);
  }
  lines.push("");
  lines.push("## Dimension rollup");
  lines.push("");
  lines.push("| Dimension | PASS | FAIL | UNVERIFIED |");
  lines.push("|---|---:|---:|---:|");
  for (const d of report.dimensionRollup) {
    lines.push(`| ${d.dimension} | ${d.pass} | ${d.fail} | ${d.unverified} |`);
  }
  lines.push("");
  lines.push("## Highest-risk omissions → production agent");
  lines.push("");
  for (const d of report.highestRiskOmissions) {
    lines.push(`### ${d.defectId} [${d.severity}]`);
    lines.push("");
    lines.push(d.title);
    lines.push("");
    lines.push(`- Sample: \`${d.sampleId}\``);
    lines.push(`- Dimension: \`${d.dimension}\``);
    lines.push(`- Blocks legal verification: ${d.blocksLegalVerification}`);
    lines.push("- Repro:");
    for (const s of d.reproducibleSteps) lines.push(`  1. ${s}`);
    lines.push(`- Expected: ${d.expectedSafeBehavior}`);
    lines.push(`- Observed: ${d.observedBehavior}`);
    lines.push("");
  }
  lines.push("## Outstanding gaps");
  lines.push("");
  for (const g of report.outstandingGaps) lines.push(`- ${g}`);
  lines.push("");
  lines.push("## Reproducible commands");
  lines.push("");
  lines.push("```bash");
  for (const c of report.reproducibleCommands) lines.push(c);
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

main();
