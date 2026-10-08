/**
 * Rare Covenant Drafting Discovery — offline runner.
 *
 * - No paid model calls
 * - Does not modify production legal rules / certification pins
 * - Writes reviewer queue, acquisition list, coverage, and mission report
 *
 * Run: npx tsx scripts/rare-covenant-drafting-discovery.ts
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { runNoveltyDiscovery } from "../lib/drafting-novelty";
import type { NoveltyFinding, ReviewerQueueItem, AcquisitionRecommendation } from "../lib/drafting-novelty";

const OUT = "docs/rare-covenant-drafting-discovery";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shaOfFile(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function markdownReport(args: {
  generatedAt: string;
  coverage: ReturnType<typeof runNoveltyDiscovery>["corpusCoverage"];
  findings: NoveltyFinding[];
  queue: ReviewerQueueItem[];
  acquisition: AcquisitionRecommendation[];
  missing: { documentId: string; path: string }[];
  topFindings: NoveltyFinding[];
}): string {
  const lines: string[] = [];
  lines.push("# Rare Covenant Drafting Discovery — Mission Report");
  lines.push("");
  lines.push(`Generated: ${args.generatedAt}`);
  lines.push(`Version: rare-covenant-drafting-discovery.v1`);
  lines.push(`Paid calls: 0`);
  lines.push(`Production legal rules modified: false`);
  lines.push("");
  lines.push("## Corpus coverage");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Corpus documents | ${args.coverage.corpusDocuments} |`);
  lines.push(`| Probe documents | ${args.coverage.probeDocuments} |`);
  lines.push(`| Corpus units | ${args.coverage.corpusUnits} |`);
  lines.push(`| Probe units | ${args.coverage.probeUnits} |`);
  lines.push(`| Signature keys (total) | ${args.coverage.signatureKeysTotal} |`);
  lines.push(`| Probe-only signatures | ${args.coverage.signatureKeysProbeOnly} |`);
  lines.push(`| Corpus-only signatures | ${args.coverage.signatureKeysCorpusOnly} |`);
  lines.push(`| Shared signatures | ${args.coverage.signatureKeysShared} |`);
  lines.push("");
  lines.push("### Packages");
  lines.push("");
  for (const p of args.coverage.packages) {
    lines.push(`- \`${p.packageId}\` (${p.role}): ${p.documents} docs, ${p.units} units`);
  }
  lines.push("");
  lines.push("### Units by category");
  lines.push("");
  lines.push(`| Category | Corpus | Probe |`);
  lines.push(`| --- | ---: | ---: |`);
  for (const [cat, counts] of Object.entries(args.coverage.unitsByCategory)) {
    lines.push(`| ${cat} | ${counts.corpus} | ${counts.probe} |`);
  }
  lines.push("");
  lines.push("## Method (deterministic)");
  lines.push("");
  lines.push("1. Normalize EDGAR/HTML artifacts and whitespace.");
  lines.push("2. Slice documents into drafting windows (section/definition/proviso/hotspot).");
  lines.push("3. Multi-label category detect + structural signature tokens (shape, not values).");
  lines.push("4. Cluster by signature key; score novelty from corpus support, signature distance, and high-risk tokens.");
  lines.push("5. Attach lexical neighbors as comparison examples only — **never** as semantic equivalence.");
  lines.push("6. Emit reviewer queue + diversified acquisition recommendations for the knowledge factory.");
  lines.push("");
  lines.push("## Diversified reviewer queue (first 12)");
  lines.push("");
  for (const q of args.queue.slice(0, 12)) {
    lines.push(
      `${q.queueRank}. **${q.category}** / ${q.suspectedFailureMode} (score ${q.noveltyScore}) — \`${q.sourceSpan.path}:${q.sourceSpan.charStart}-${q.sourceSpan.charEnd}\``,
    );
    lines.push(`   ${JSON.stringify(q.sourceSpan.excerpt.slice(0, 220))}`);
    lines.push(`   Signature: \`${q.signatureKey}\``);
    lines.push("");
  }

  lines.push("## Real novelty findings (score-ordered sample)");
  lines.push("");
  for (const f of args.topFindings) {
    lines.push(`### ${f.rarityRank}. ${f.category} — score ${f.noveltyScore}`);
    lines.push("");
    lines.push(`- Finding: \`${f.findingId}\``);
    lines.push(`- Failure mode: **${f.suspectedFailureMode}** — ${f.failureRationale}`);
    lines.push(`- Signature: \`${f.signatureKey}\``);
    lines.push(`- Corpus support: ${f.corpusSupport}; probe support: ${f.probeSupport}; cluster size: ${f.clusterSize}`);
    lines.push(`- Source: \`${f.span.path}\` chars \`[${f.span.charStart}, ${f.span.charEnd})\``);
    lines.push(`- Excerpt: ${JSON.stringify(f.span.excerpt.slice(0, 320))}`);
    if (f.comparisonExamples[0]) {
      const n = f.comparisonExamples[0];
      lines.push(
        `- Comparison (lexical only, Jaccard ${n.jaccard}, equivalenceClaim=${n.equivalenceClaim}): \`${n.packageId}\` / \`${n.signatureKey}\` — ${JSON.stringify(n.excerpt.slice(0, 180))}`,
      );
    }
    lines.push("");
  }
  lines.push("## Reviewer queue (summary)");
  lines.push("");
  lines.push(`Queue size: ${args.queue.length}. Full JSON: \`03-reviewer-queue.json\`.`);
  lines.push("");
  for (const q of args.queue.slice(0, 15)) {
    lines.push(
      `${q.queueRank}. [${q.noveltyScore}] ${q.category} / ${q.suspectedFailureMode} @ \`${q.sourceSpan.path}:${q.sourceSpan.charStart}-${q.sourceSpan.charEnd}\``,
    );
  }
  lines.push("");
  lines.push("## Knowledge-factory acquisition recommendations");
  lines.push("");
  for (const a of args.acquisition) {
    lines.push(`### ${a.priority}. ${a.category}`);
    lines.push("");
    lines.push(`- ${a.rationale}`);
    lines.push(`- Target shape: ${a.targetDraftingShape}`);
    lines.push(`- Search hints: ${a.suggestedPublicSearchHints.map((s) => JSON.stringify(s)).join("; ")}`);
    lines.push(`- Diversifies away from: ${a.diversifiesAwayFrom.join("; ")}`);
    lines.push("");
  }
  if (args.missing.length) {
    lines.push("## Missing registry files");
    lines.push("");
    for (const m of args.missing) lines.push(`- ${m.documentId}: ${m.path}`);
    lines.push("");
  }
  lines.push("## Guardrails honored");
  lines.push("");
  lines.push("- No production legal-rule edits");
  lines.push("- No paid calls / merges / certification changes");
  lines.push("- Embedding similarity never used as semantic equivalence");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const result = runNoveltyDiscovery({ queueLimit: 40 });

  writeJson(`${OUT}/01-corpus-coverage.json`, {
    version: result.version,
    generatedAt: result.generatedAt,
    paidCalls: result.paidCalls,
    productionLegalRulesModified: result.productionLegalRulesModified,
    missingDocuments: result.missingDocuments,
    coverage: result.corpusCoverage,
  });

  writeJson(`${OUT}/02-clusters.json`, {
    version: result.version,
    clusterCount: result.clusters.length,
    clusters: result.clusters,
  });

  writeJson(`${OUT}/03-reviewer-queue.json`, {
    version: result.version,
    count: result.reviewerQueue.length,
    queue: result.reviewerQueue,
  });

  writeJson(`${OUT}/04-novelty-findings.json`, {
    version: result.version,
    count: result.findings.length,
    findings: result.findings,
  });

  writeJson(`${OUT}/05-acquisition-recommendations.json`, {
    version: result.version,
    count: result.acquisitionRecommendations.length,
    recommendations: result.acquisitionRecommendations,
  });

  const top = result.findings.slice(0, 20);
  const report = markdownReport({
    generatedAt: result.generatedAt,
    coverage: result.corpusCoverage,
    findings: result.findings,
    queue: result.reviewerQueue,
    acquisition: result.acquisitionRecommendations,
    missing: result.missingDocuments,
    topFindings: top,
  });
  writeFileSync(`${OUT}/00-mission-report.md`, report, "utf8");

  writeJson(`${OUT}/06-run-manifest.json`, {
    version: result.version,
    generatedAt: result.generatedAt,
    paidCalls: 0,
    productionLegalRulesModified: false,
    artifactShas: {
      "00-mission-report.md": shaOfFile(`${OUT}/00-mission-report.md`),
      "01-corpus-coverage.json": shaOfFile(`${OUT}/01-corpus-coverage.json`),
      "02-clusters.json": shaOfFile(`${OUT}/02-clusters.json`),
      "03-reviewer-queue.json": shaOfFile(`${OUT}/03-reviewer-queue.json`),
      "04-novelty-findings.json": shaOfFile(`${OUT}/04-novelty-findings.json`),
      "05-acquisition-recommendations.json": shaOfFile(`${OUT}/05-acquisition-recommendations.json`),
    },
    findingCount: result.findings.length,
    queueCount: result.reviewerQueue.length,
    probeOnlySignatures: result.corpusCoverage.signatureKeysProbeOnly,
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        out: OUT,
        findings: result.findings.length,
        queue: result.reviewerQueue.length,
        probeOnlySignatures: result.corpusCoverage.signatureKeysProbeOnly,
        missing: result.missingDocuments.length,
      },
      null,
      2,
    ),
  );
}

main();
