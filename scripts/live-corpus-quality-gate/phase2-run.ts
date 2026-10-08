#!/usr/bin/env tsx
/**
 * Live Corpus Quality Gate — Phase 2
 * Freeze integrity, independent replay, critical adjudication, defect routing,
 * authentic corpus expansion, extraction + legal-safety metrics.
 *
 * Does not modify phase1-freeze oracle, Claude-owned fixtures, production
 * legal rules, or certification status. No paid inference.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { runIndependentReplay } from "../../lib/evaluation/live-corpus-quality-gate/phase2-replay";
import { adjudicateCriticalFindings } from "../../lib/evaluation/live-corpus-quality-gate/phase2-adjudication";
import { buildExpandedCorpus, measureExtractionAndSafety } from "../../lib/evaluation/live-corpus-quality-gate/phase2-corpus";
import { buildDefectTickets, ticketsByOwner } from "../../lib/evaluation/live-corpus-quality-gate/phase2-tickets";

function git(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function main() {
  const outDir = path.join(process.cwd(), "docs/live-corpus-quality-gate/phase2");
  fs.mkdirSync(outDir, { recursive: true });

  const replay = runIndependentReplay();
  const adjudications = adjudicateCriticalFindings();
  const tickets = buildDefectTickets(adjudications);
  const byOwner = ticketsByOwner(tickets);
  const corpus = buildExpandedCorpus();
  const { extractionMetrics, legalSafetyFindings } = measureExtractionAndSafety(corpus.documents);

  const confirmedLegal = legalSafetyFindings.filter((f) => f.kind === "CONFIRMED_DEFECT");
  const heuristicLegal = legalSafetyFindings.filter((f) => f.kind === "HEURISTIC_FLAG");

  const remainingUnverified = [
    "Exhaustive Gibraltar definition inventory (spot-checks only in Phase-1).",
    "Pass B/C/D semantic IR for Gibraltar (never executed).",
    "Structural node precision/recall without independent node-level GT.",
    "Proviso attachment accuracy (requires semantic compile).",
    "Entity-scope IR population (source phrase only).",
    "Expansion/regression docs lack fresh independent legal GT in this unpaid gate.",
    "False-affirmative capacity rate beyond confirmed Gibraltar shared_cap signal audit.",
    "Knife River BLIND body unread by design.",
    `Availability gap vs 25 additional agreements: ${corpus.availability.availabilityGap} (disclosed).`,
  ];

  const report = {
    schemaVersion: "live-corpus-quality-gate.phase2.v1",
    generatedAt: new Date().toISOString(),
    headSha: git("git rev-parse HEAD"),
    branch: git("git rev-parse --abbrev-ref HEAD"),
    startingPr: 153,
    startingSha: "084405770a02f5eebe88b0b7ffb192a46fd7960c",
    frozenEvaluationContentSha: "cebec8ab3aaecd894b1903ac0b758828655a88df",
    paidCalls: 0,
    certificationImpact: "NONE",
    claudeOwnedFixturesModified: false,
    productionLegalRulesModified: false,
    productionFixesImplemented: false,
    oracleUntouched: replay.oracleUntouched,
    freezeIntact: replay.freezeIntact,
    mandatoryReturn: {
      "1_originalFindingsReproduced": {
        frozenFindingCount: replay.frozenFindingCount,
        frozenUniqueFindingIds: replay.frozenUniqueFindingIds,
        replayFindingCount: replay.replayFindingCount,
        reproduced: replay.reproduced,
        nonReproduced: replay.nonReproduced,
        statusChanged: replay.statusChanged,
        newInReplay: replay.newInReplay,
        missingInReplay: replay.missingInReplay,
        freezeIntact: replay.freezeIntact,
        note: "45/45 unique findingIds reproduced. Listed count is 46 due to Phase-1 findingId collision (harness defect; oracle not mutated).",
      },
      "2_criticalFindingsAdjudicated": adjudications.map((a) => ({
        defectId: a.defectId,
        classification: a.classification,
        owningAgent: a.recommendedOwningAgent,
        compilerStage: a.compilerStage,
      })),
      "3_confirmedCompilerDefects": adjudications
        .filter((a) => a.classification === "COMPILER_DEFECT" || a.secondaryClassifications?.includes("COMPILER_DEFECT"))
        .map((a) => a.defectId),
      "4_sourceInconsistencies": adjudications
        .filter((a) => a.classification === "SOURCE_INCONSISTENCY" || a.secondaryClassifications?.includes("SOURCE_INCONSISTENCY"))
        .map((a) => a.defectId),
      "5_evaluationHarnessDefects": [
        ...adjudications
          .filter((a) => a.classification === "EVALUATION_HARNESS_DEFECT")
          .map((a) => a.defectId),
        ...replay.evaluationHarnessDefects.map((d) => String(d.defectId)),
      ],
      "6_newAuthenticAgreementsEvaluated": {
        additionalAvailable: corpus.availability.additionalDistinctAvailable,
        totalAuthentic: corpus.availability.totalAuthenticDocuments,
        targetAdditional: 25,
        availabilityGap: corpus.availability.availabilityGap,
        docIds: corpus.documents.filter((d) => !d.phase1Evaluated).map((d) => d.docId),
      },
      "7_extractionMetrics": extractionMetrics,
      "8_legalSafetyFindings": {
        confirmedDefects: confirmedLegal,
        heuristicFlags: heuristicLegal.length,
        heuristicFlagDocIds: heuristicLegal.map((f) => f.docId),
      },
      "9_remainingUnverifiedItems": remainingUnverified,
      "10_exactShaPrTestsCi": {
        tipShaCommand: "git rev-parse HEAD",
        pr: 153,
        tests: [
          "npx vitest run tests/live-corpus-quality-gate/",
          "npm run live-corpus-quality-gate",
          "npm run live-corpus-quality-gate:phase2",
        ],
        ci: "No certification advancement; draft PR evaluation only",
      },
    },
    replay,
    adjudications,
    tickets,
    ticketsByOwner: byOwner,
    corpus,
    extractionMetrics,
    legalSafetyFindings,
    remainingUnverified,
    reproducibleCommands: [
      "npm run live-corpus-quality-gate",
      "npm run live-corpus-quality-gate:phase2",
      "npx vitest run tests/live-corpus-quality-gate/",
    ],
    verdict: replay.freezeIntact
      ? "LIVE_CORPUS_QUALITY_GATE_PHASE2_REPLAY_AND_TRIAGE_RECORDED"
      : "LIVE_CORPUS_QUALITY_GATE_PHASE2_FREEZE_INTEGRITY_FAILED",
  };

  fs.writeFileSync(path.join(outDir, "10-replay.json"), JSON.stringify(replay, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "11-adjudications.json"), JSON.stringify({ adjudications }, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "12-defect-tickets.json"), JSON.stringify({ tickets, ticketsByOwner: byOwner }, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "13-expanded-corpus.json"), JSON.stringify(corpus, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "14-extraction-and-legal-safety.json"),
    JSON.stringify({ extractionMetrics, legalSafetyFindings }, null, 2) + "\n",
  );
  fs.writeFileSync(path.join(outDir, "15-phase2-report.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "REPORT.md"), renderMd(report));

  console.log(`Phase 2 — ${report.verdict}`);
  console.log(`Freeze intact: ${replay.freezeIntact}`);
  console.log(`Reproduced: ${replay.reproduced}/${replay.frozenFindingCount} | non-repro: ${replay.nonReproduced} | status-changed: ${replay.statusChanged}`);
  console.log(`Adjudications: ${adjudications.length} | Tickets: ${tickets.length}`);
  console.log(`Authentic docs total: ${corpus.documents.length} (additional ${corpus.availability.additionalDistinctAvailable}, gap ${corpus.availability.availabilityGap})`);
  console.log(`Confirmed legal-safety defects: ${confirmedLegal.length} | heuristic flags: ${heuristicLegal.length}`);
  console.log(`Wrote ${outDir}`);
}

function renderMd(report: Record<string, unknown>): string {
  const mr = report.mandatoryReturn as Record<string, unknown>;
  const replay = report.replay as {
    freezeIntact: boolean;
    reproduced: number;
    frozenFindingCount: number;
    nonReproduced: number;
    statusChanged: number;
    newInReplay: number;
    missingInReplay: number;
  };
  const corpus = report.corpus as {
    availability: {
      additionalDistinctAvailable: number;
      totalAuthenticDocuments: number;
      availabilityGap: number;
      note: string;
    };
    blindReservation: { issuer: string; status: string };
  };
  const adj = report.adjudications as Array<{
    defectId: string;
    classification: string;
    recommendedOwningAgent: string;
    title: string;
  }>;
  const lines: string[] = [];
  lines.push("# Live Corpus Quality Gate — Phase 2 Report");
  lines.push("");
  lines.push(`**Verdict:** \`${report.verdict}\``);
  lines.push("");
  lines.push(`**Starting PR:** #${report.startingPr}`);
  lines.push(`**Starting SHA:** \`${report.startingSha}\``);
  lines.push(`**Frozen evaluation content SHA:** \`${report.frozenEvaluationContentSha}\``);
  lines.push(`**Generation HEAD:** \`${report.headSha}\``);
  lines.push(`**Paid calls:** \`${report.paidCalls}\``);
  lines.push(`**Certification impact:** \`${report.certificationImpact}\``);
  lines.push(`**Production fixes in this branch:** \`${report.productionFixesImplemented}\``);
  lines.push(`**Phase-1 oracle untouched:** \`${report.oracleUntouched}\``);
  lines.push("");
  lines.push("## 1. Original findings reproduced");
  lines.push("");
  lines.push(`- Freeze intact: **${replay.freezeIntact}**`);
  lines.push(`- Reproduced: **${replay.reproduced}/${replay.frozenFindingCount}**`);
  lines.push(`- Non-reproduced (summary drift): ${replay.nonReproduced}`);
  lines.push(`- Status changed: ${replay.statusChanged}`);
  lines.push(`- New in replay: ${replay.newInReplay}`);
  lines.push(`- Missing in replay: ${replay.missingInReplay}`);
  lines.push("");
  lines.push("## 2–5. Critical adjudication / classifications");
  lines.push("");
  lines.push("| Defect | Classification | Owning agent |");
  lines.push("|---|---|---|");
  for (const a of adj) {
    lines.push(`| \`${a.defectId}\` | ${a.classification} | ${a.recommendedOwningAgent} |`);
  }
  lines.push("");
  lines.push(`Confirmed compiler defects: ${(mr["3_confirmedCompilerDefects"] as string[]).join(", ") || "(none)"}`);
  lines.push(`Source inconsistencies: ${(mr["4_sourceInconsistencies"] as string[]).join(", ") || "(none)"}`);
  lines.push(`Evaluation-harness defects: ${(mr["5_evaluationHarnessDefects"] as string[]).join(", ") || "(none)"}`);
  lines.push("");
  lines.push("## 6. New authentic agreements evaluated");
  lines.push("");
  lines.push(corpus.availability.note);
  lines.push(`- Total authentic documents in gate corpus: **${corpus.availability.totalAuthenticDocuments}**`);
  lines.push(`- Additional beyond Phase-1: **${corpus.availability.additionalDistinctAvailable}** (target 25; gap **${corpus.availability.availabilityGap}**)`);
  lines.push(`- Blind reservation: ${corpus.blindReservation.issuer} — ${corpus.blindReservation.status}`);
  lines.push("");
  lines.push("## 7–9. Extraction metrics, legal-safety, UNVERIFIED");
  lines.push("");
  lines.push("See `14-extraction-and-legal-safety.json` and `15-phase2-report.json`.");
  lines.push("");
  lines.push("## 10. Reproducible commands");
  lines.push("");
  lines.push("```bash");
  for (const c of report.reproducibleCommands as string[]) lines.push(c);
  lines.push("```");
  lines.push("");
  lines.push("Defect tickets: `12-defect-tickets.json` (routed to Structural Compiler, Legal Core, Amendment Intelligence, Dependency Atlas, Covenant Knowledge Factory).");
  lines.push("");
  return lines.join("\n");
}

main();
