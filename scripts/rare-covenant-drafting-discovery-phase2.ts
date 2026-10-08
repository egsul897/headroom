/**
 * Phase 2 — Validated Novelty runner.
 *
 * - Balanced novelty metrics (equal samples, reproducible splits, LOIO)
 * - Controlling-context recovery (CONTEXT_INCOMPLETE when missing)
 * - Independent stratified review of the 40-item queue
 * - EDGAR acquisition via existing EdgarConnector (target 100, subject to availability)
 * - Knowledge-factory novelty import export (canonical contract; no competing schema)
 *
 * No paid inference, merges, certification changes, production legal-rule edits,
 * or Claude-owned fixture modifications.
 *
 * Run: npx tsx scripts/rare-covenant-drafting-discovery-phase2.ts [--skip-acquire]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { DOCUMENT_REGISTRY, loadAcquiredDocumentSources } from "../lib/drafting-novelty/corpus";
import { loadUnits, runNoveltyDiscovery } from "../lib/drafting-novelty/pipeline";
import { runBalancedNoveltyEvaluation } from "../lib/drafting-novelty/balanced";
import { recoverContextsForFindings } from "../lib/drafting-novelty/context";
import { independentlyReviewQueue } from "../lib/drafting-novelty/review";
import { buildHighRiskExamples, buildKnowledgeFactoryImport } from "../lib/drafting-novelty/kf-export";
import { acquireAgreementsViaEdgarConnector } from "../lib/drafting-novelty/acquire";
import { DRAFTING_NOVELTY_PHASE2_VERSION } from "../lib/drafting-novelty/phase2-types";
import type { DocumentSource } from "../lib/drafting-novelty/types";

const OUT = "docs/rare-covenant-drafting-discovery/phase2";
const STARTING_SHA = "6c9e8a65c9cbac50c922c0d4ec4a91611957fdbb";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shaOf(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function headSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const skipAcquire = process.argv.includes("--skip-acquire");

  let acquiredManifests: Awaited<ReturnType<typeof acquireAgreementsViaEdgarConnector>>["manifests"] = [];
  let acquireErrors: string[] = [];
  if (!skipAcquire) {
    // eslint-disable-next-line no-console
    console.log("Acquiring via EdgarConnector (target 100, fair-access delayed)...");
    const acq = await acquireAgreementsViaEdgarConnector({ targetCount: 100, delayMs: 400, maxPerTicker: 2, filingsPerTicker: 15 });
    acquiredManifests = acq.manifests;
    acquireErrors = acq.errors;
    writeJson(`${OUT}/10-acquisition-errors.json`, { count: acquireErrors.length, errors: acquireErrors.slice(0, 200) });
  } else {
    // Resume whatever is already on disk.
    if (existsSync("data/rare-covenant-drafting-discovery/acquired-index.json")) {
      acquiredManifests = JSON.parse(readFileSync("data/rare-covenant-drafting-discovery/acquired-index.json", "utf8"));
    }
  }

  const registry: DocumentSource[] = [...DOCUMENT_REGISTRY, ...loadAcquiredDocumentSources()];
  const { units, loaded, missing } = loadUnits(registry);
  const discovery = runNoveltyDiscovery({ registry, queueLimit: 40 });

  const balanced = runBalancedNoveltyEvaluation(units);
  writeJson(`${OUT}/01-balanced-novelty.json`, balanced);

  const contexts = recoverContextsForFindings(discovery.findings);
  writeJson(`${OUT}/02-controlling-contexts.json`, {
    version: DRAFTING_NOVELTY_PHASE2_VERSION,
    count: contexts.length,
    complete: contexts.filter((c) => c.completeness === "COMPLETE").length,
    partial: contexts.filter((c) => c.completeness === "PARTIAL").length,
    incomplete: contexts.filter((c) => c.completeness === "CONTEXT_INCOMPLETE").length,
    contexts,
  });

  const independentReview = independentlyReviewQueue(discovery.reviewerQueue, discovery.findings, { sampleSize: 20 });
  writeJson(`${OUT}/03-independent-review.json`, independentReview);

  const contextIncompleteFindingIds = contexts.filter((c) => c.completeness === "CONTEXT_INCOMPLETE").map((c) => c.findingId);
  const extractionArtifacts = independentReview.items
    .filter((i) => i.independentLabel === "DUPLICATE_OR_EXTRACTION_ARTIFACT")
    .map((i) => i.findingId);

  const highRisk = buildHighRiskExamples(discovery.findings, independentReview.items);
  writeJson(`${OUT}/04-high-risk-examples.json`, { version: DRAFTING_NOVELTY_PHASE2_VERSION, count: highRisk.length, examples: highRisk });

  const kfImport = buildKnowledgeFactoryImport(discovery.findings, discovery.reviewerQueue, independentReview.items, { limit: 40 });
  // Enrich sourceIdentity for acquired docs.
  const acqByPath = new Map(acquiredManifests.map((m) => [m.textPath, m]));
  for (const row of kfImport) {
    const m = acqByPath.get(row.sourceIdentity.path);
    if (m) {
      row.sourceIdentity.issuerCik = m.issuerCik;
      row.sourceIdentity.issuerTicker = m.issuerTicker;
      row.sourceIdentity.issuerName = m.issuerName;
      row.sourceIdentity.accessionNumber = m.accessionNumber;
      row.sourceIdentity.exhibitFilename = m.exhibitFilename;
      row.sourceIdentity.sourceUrl = m.sourceUrl;
      row.sourceIdentity.filingDate = m.filingDate;
      row.sourceIdentity.formType = m.formType;
      row.sourceIdentity.originalBytesHash = m.originalBytesHash;
      row.sourceIdentity.usageRightsReviewStatus = "PUBLIC_SEC_EDGAR";
      row.sourceId = m.sourceId;
    }
  }
  writeJson(`${OUT}/05-knowledge-factory-import.json`, {
    schema: "knowledge-factory.novelty-import.v1",
    version: DRAFTING_NOVELTY_PHASE2_VERSION,
    count: kfImport.length,
    note: "Canonical KF handoff. Does not write Permission/capacity rules. representationLevel never REVIEWER_VERIFIED/CERTIFIED.",
    records: kfImport,
  });

  writeJson(`${OUT}/06-acquired-agreements.json`, {
    target: 100,
    acquired: acquiredManifests.length,
    distinctIssuers: new Set(acquiredManifests.map((m) => m.issuerCik)).size,
    manifests: acquiredManifests,
  });

  const head = headSha();
  const reportMd = buildReport({
    head,
    balanced,
    independentReview,
    acquiredManifests,
    contextIncompleteFindingIds,
    extractionArtifacts,
    highRisk,
    kfImportCount: kfImport.length,
    loadedCount: loaded.length,
    missingCount: missing.length,
    unitCounts: { corpus: units.filter((u) => u.role === "CORPUS").length, probe: units.filter((u) => u.role === "PROBE").length },
    acquireErrors: acquireErrors.length,
  });
  writeFileSync(`${OUT}/00-phase2-mission-report.md`, reportMd, "utf8");

  writeJson(`${OUT}/07-run-manifest.json`, {
    version: DRAFTING_NOVELTY_PHASE2_VERSION,
    startingSha: STARTING_SHA,
    headSha: head,
    generatedAt: new Date().toISOString(),
    paidCalls: 0,
    productionLegalRulesModified: false,
    claudeOwnedFixturesModified: false,
    acquiredAgreements: acquiredManifests.length,
    acquiredIssuers: new Set(acquiredManifests.map((m) => m.issuerCik)).size,
    knowledgeFactoryImportCount: kfImport.length,
    contextIncompleteCount: contextIncompleteFindingIds.length,
    extractionArtifactCount: extractionArtifacts.length,
    artifactShas: Object.fromEntries(
      [
        "00-phase2-mission-report.md",
        "01-balanced-novelty.json",
        "02-controlling-contexts.json",
        "03-independent-review.json",
        "04-high-risk-examples.json",
        "05-knowledge-factory-import.json",
        "06-acquired-agreements.json",
        "08-knowledge-factory-source-records.json",
      ].map((f) => [f, shaOf(`${OUT}/${f}`)]),
    ),
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        out: OUT,
        head,
        acquired: acquiredManifests.length,
        issuers: new Set(acquiredManifests.map((m) => m.issuerCik)).size,
        balancedProbeOnlyMean: balanced.equalSizedStability.probeOnlyRateMean,
        independentReview: independentReview.countsByLabel,
        contextIncomplete: contextIncompleteFindingIds.length,
        kfImport: kfImport.length,
        acquireErrors: acquireErrors.length,
      },
      null,
      2,
    ),
  );
}

function buildReport(args: {
  head: string;
  balanced: ReturnType<typeof runBalancedNoveltyEvaluation>;
  independentReview: ReturnType<typeof independentlyReviewQueue>;
  acquiredManifests: Array<{ issuerTicker: string; issuerName: string; sourceId: string; documentTitle: string; filingDate: string }>;
  contextIncompleteFindingIds: string[];
  extractionArtifacts: string[];
  highRisk: ReturnType<typeof buildHighRiskExamples>;
  kfImportCount: number;
  loadedCount: number;
  missingCount: number;
  unitCounts: { corpus: number; probe: number };
  acquireErrors: number;
}): string {
  const lines: string[] = [];
  lines.push("# Rare Drafting Discovery Phase 2 — Validated Novelty");
  lines.push("");
  lines.push(`Starting SHA: \`${STARTING_SHA}\``);
  lines.push(`Exact HEAD: \`${args.head}\``);
  lines.push(`Version: ${DRAFTING_NOVELTY_PHASE2_VERSION}`);
  lines.push(`Paid calls: 0`);
  lines.push(`Production legal rules modified: false`);
  lines.push(`Claude-owned fixtures modified: false`);
  lines.push("");
  lines.push("## 1. New authentic agreements and issuers");
  lines.push("");
  lines.push(`Acquired via existing \`EdgarConnector\` (not a new downloader): **${args.acquiredManifests.length}** agreements across **${new Set(args.acquiredManifests.map((m) => m.issuerTicker)).size}** issuers (target 100; subject to SEC availability / fair-access). Acquisition errors: ${args.acquireErrors}.`);
  lines.push("");
  for (const m of args.acquiredManifests.slice(0, 25)) {
    lines.push(`- \`${m.issuerTicker}\` ${m.issuerName} — ${m.documentTitle.slice(0, 100)} (${m.filingDate})`);
  }
  if (args.acquiredManifests.length > 25) lines.push(`- … +${args.acquiredManifests.length - 25} more (see \`06-acquired-agreements.json\`)`);
  lines.push("");
  lines.push(`Fixture registry also expanded (paths only, no fixture byte edits): loaded docs=${args.loadedCount}, missing=${args.missingCount}, units corpus/probe=${args.unitCounts.corpus}/${args.unitCounts.probe}.`);
  lines.push("");
  lines.push("## 2. Balanced novelty metrics");
  lines.push("");
  lines.push(args.balanced.disclaimer);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Equal-sized splits | ${args.balanced.equalSizedStability.splitCount} |`);
  lines.push(`| Probe-only rate mean ± std | ${args.balanced.equalSizedStability.probeOnlyRateMean} ± ${args.balanced.equalSizedStability.probeOnlyRateStd} |`);
  lines.push(`| Mean top novelty score mean ± std | ${args.balanced.equalSizedStability.meanTopScoreMean} ± ${args.balanced.equalSizedStability.meanTopScoreStd} |`);
  lines.push(`| Leave-one-issuer-out rows | ${args.balanced.leaveOneIssuerOut.length} |`);
  lines.push(`| Leave-one-instrument-out rows | ${args.balanced.leaveOneInstrumentOut.length} |`);
  lines.push("");
  lines.push("Sample-size sensitivity:");
  for (const s of args.balanced.equalSizedStability.sampleSizeSensitivity) {
    lines.push(`- n=${s.sampleSize}: probeOnlyRateMean=${s.probeOnlyRateMean}, meanTopScoreMean=${s.meanTopScoreMean}`);
  }
  lines.push("");
  lines.push("## 3. Reviewed findings");
  lines.push("");
  lines.push(`Stratified sample of ${args.independentReview.sampleSize} / ${args.independentReview.queueSize} queue items.`);
  lines.push("");
  for (const [k, v] of Object.entries(args.independentReview.countsByLabel)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push(`- Confirmed legal defects: **${args.independentReview.confirmedLegalDefectCount}** (heuristic labels are not treated as confirmed defects)`);
  lines.push("");
  for (const it of args.independentReview.items.slice(0, 12)) {
    lines.push(
      `${it.queueRank}. ${it.independentLabel} — heuristic=${it.heuristicFailureMode} confirmed=${String(it.confirmedLegalDefect)} ctx=${it.contextCompleteness} — \`${it.sourceSpan.path}:${it.sourceSpan.charStart}-${it.sourceSpan.charEnd}\``,
    );
  }
  lines.push("");
  lines.push("## 4. Confirmed extraction artifacts");
  lines.push("");
  lines.push(args.extractionArtifacts.length ? args.extractionArtifacts.map((id) => `- \`${id}\``).join("\n") : "- None in stratified sample.");
  lines.push("");
  lines.push("## 5. Context-incomplete findings");
  lines.push("");
  lines.push(`Count: ${args.contextIncompleteFindingIds.length}`);
  for (const id of args.contextIncompleteFindingIds.slice(0, 20)) lines.push(`- \`${id}\``);
  lines.push("");
  lines.push("## 6. High-risk drafting examples");
  lines.push("");
  for (const ex of args.highRisk) {
    lines.push(`### ${ex.family}`);
    lines.push(`- Finding \`${ex.findingId}\` @ \`${ex.sourceSpan.path}:${ex.sourceSpan.charStart}-${ex.sourceSpan.charEnd}\``);
    lines.push(`- Context: ${ex.controllingContextCompleteness}`);
    lines.push(`- Hypothesis: ${ex.riskHypothesis}`);
    lines.push(`- Uncertainty: ${ex.uncertainty.join("; ")}`);
    lines.push(`- Counterexamples: ${ex.counterexampleSpans.length}`);
    lines.push("");
  }
  lines.push("## 7. Knowledge-factory import results");
  lines.push("");
  lines.push(`Exported **${args.kfImportCount}** records to \`05-knowledge-factory-import.json\` using schema \`knowledge-factory.novelty-import.v1\` (source identity + novelty signature + controlling context + dependencies + risk hypothesis + reviewer status + precedent neighbors + unresolved issues). Representation levels stop at REVIEW_REQUIRED; never invents REVIEWER_VERIFIED/CERTIFIED.`);
  lines.push("");
  lines.push("## 8. Exact SHA, tests, and PR status");
  lines.push("");
  lines.push(`- Starting SHA: \`${STARTING_SHA}\``);
  lines.push(`- Exact HEAD at report: \`${args.head}\``);
  lines.push(`- PR: https://github.com/egsul897/headroom/pull/147 (draft; do not merge)`);
  lines.push(`- Tests: \`npx vitest run tests/drafting-novelty\``);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
