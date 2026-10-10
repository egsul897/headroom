/**
 * Agent 1 — Covenant Intelligence Factory cycle runner (read-only Neon + fixtures).
 *
 * Measures corpus maturity, mechanic coverage from Neon BYTEA samples,
 * instrument-identity gaps, UNKNOWN reclassify dry-run, and CKG holdout metrics.
 * Never mutates Neon unless KF_MASS_PRECEDENT_LIVE_WRITE is set with --write.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { classifyDebtDocument } from "../../lib/knowledge-factory/classify/debt-document";
import { computeInstrumentIdentity } from "../../lib/knowledge-factory/pipeline/instrument-identity";
import { detectPatternsInText, allPatterns } from "../../lib/knowledge-factory/patterns/library";
import {
  hasAggregateCeilingLanguage,
  isSharedCapacityLanguage,
} from "../../lib/knowledge-factory/patterns/shared-capacity";
import { CORPUS_POPULATION_REGISTRY } from "../../lib/knowledge-factory/corpus/population-registry";
import type { DebtDocumentClass } from "../../lib/knowledge-factory/types";

const OUT_DIR = path.resolve("docs/intelligence-factory");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const started = Date.now();

  const total = await prisma.knowledgeSource.count();
  const publicRows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: {
      sourceId: true,
      issuerCik: true,
      issuerTicker: true,
      documentClass: true,
      documentTitle: true,
      exhibitFilename: true,
      formType: true,
      instrumentIdentity: true,
      originalBytesHash: true,
      representationLevel: true,
      provenance: true,
      storageRef: true,
      metadata: true,
      filingDate: true,
    },
  });

  const levels = await prisma.knowledgeSource.groupBy({ by: ["representationLevel"], _count: true });
  const byClass = await prisma.knowledgeSource.groupBy({
    by: ["documentClass"],
    _count: true,
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
  });
  const relKinds = await prisma.knowledgeRelationshipEdge.groupBy({ by: ["kind"], _count: true });
  const byteObjects = await prisma.documentByteObject.count();

  const hashes = new Map<string, string[]>();
  for (const r of publicRows) {
    if (!r.originalBytesHash) continue;
    const list = hashes.get(r.originalBytesHash) ?? [];
    list.push(r.sourceId);
    hashes.set(r.originalBytesHash, list);
  }
  const duplicateHashGroups = [...hashes.entries()].filter(([, ids]) => ids.length > 1);

  // Instrument identity dry-run (no write)
  let missingIdentity = 0;
  let wouldAssignIdentity = 0;
  const assignedIdentities = new Set<string>();
  for (const r of publicRows) {
    if (r.instrumentIdentity) {
      assignedIdentities.add(r.instrumentIdentity);
      continue;
    }
    missingIdentity += 1;
    const id = computeInstrumentIdentity({
      issuerCik: r.issuerCik,
      documentClass: r.documentClass as DebtDocumentClass,
      documentTitle: r.documentTitle,
      filingDate: r.filingDate?.toISOString?.() ?? undefined,
    });
    assignedIdentities.add(id);
    wouldAssignIdentity += 1;
  }

  // UNKNOWN reclassify dry-run
  const unknowns = publicRows.filter((r) => r.documentClass === "UNKNOWN");
  const reclassDry: Record<string, number> = {};
  let reclassable = 0;
  for (const row of unknowns) {
    const result = classifyDebtDocument({
      title: row.documentTitle ?? "",
      description: row.documentTitle ?? "",
      filename: row.exhibitFilename ?? "",
      exhibitType: row.formType ?? "",
    });
    if (result.documentClass !== "UNKNOWN") {
      reclassable += 1;
      reclassDry[result.documentClass] = (reclassDry[result.documentClass] ?? 0) + 1;
    }
  }

  // Sample Neon BYTEA for mechanic pattern coverage (read-only, capped)
  const sampleLimit = Number(process.env.KF_MECHANIC_SAMPLE_LIMIT ?? "80");
  const hashList = [...hashes.keys()].slice(0, sampleLimit);
  const blobs = hashList.length
    ? await prisma.documentByteObject.findMany({
        where: { contentHash: { in: hashList } },
        select: { contentHash: true, bytes: true },
      })
    : [];

  const mechanicDocs: Record<string, number> = {};
  let aggregateCeilingOnly = 0;
  let sharedCapacityHits = 0;
  let sampled = 0;
  for (const b of blobs) {
    const text = Buffer.from(b.bytes).toString("utf8").slice(0, 200_000);
    sampled += 1;
    const patterns = detectPatternsInText(text);
    for (const p of patterns) mechanicDocs[p] = (mechanicDocs[p] ?? 0) + 1;
    if (isSharedCapacityLanguage(text)) sharedCapacityHits += 1;
    else if (hasAggregateCeilingLanguage(text)) aggregateCeilingOnly += 1;
  }

  // Covenant summary item counts + family histogram from metadata
  let summaryItems = 0;
  let withSummary = 0;
  const familyHistogram: Record<string, number> = {};
  for (const r of publicRows) {
    const m =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};
    const summary = m.covenantSummary as { items?: Array<{ families?: string[] }> } | undefined;
    if (Array.isArray(summary?.items) && summary!.items!.length) {
      withSummary += 1;
      summaryItems += summary!.items!.length;
      for (const item of summary!.items!) {
        for (const f of item.families ?? []) {
          familyHistogram[f] = (familyHistogram[f] ?? 0) + 1;
        }
      }
    }
  }

  // CKG holdout results if present
  let ckg: unknown = null;
  const ckgPath = path.resolve("docs/covenant-knowledge-generalization-benchmark/02-evaluation-results.json");
  if (existsSync(ckgPath)) {
    ckg = JSON.parse(readFileSync(ckgPath, "utf8"));
  }

  const report = {
    schemaVersion: "intelligence-factory.agent1-corpus-cycle.v1",
    generatedAt: new Date().toISOString(),
    paidInferenceCostUsd: 0,
    neonMutations: 0,
    inventory: {
      totalKnowledgeSources: total,
      publicSecEdgar: publicRows.length,
      documentByteObjects: byteObjects,
      distinctIssuers: new Set(publicRows.map((r) => r.issuerCik)).size,
      distinctByteHashes: hashes.size,
      duplicateHashGroups: duplicateHashGroups.length,
      duplicateRows: duplicateHashGroups.reduce((n, [, ids]) => n + ids.length, 0),
      representationLevels: Object.fromEntries(levels.map((l) => [l.representationLevel, l._count])),
      byClass: Object.fromEntries(byClass.map((c) => [c.documentClass, c._count])),
      relationshipEdges: Object.fromEntries(relKinds.map((k) => [k.kind, k._count])),
      withV2Summaries: withSummary,
      covenantSummaryItems: summaryItems,
      familyHistogramTop: Object.fromEntries(
        Object.entries(familyHistogram)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
      ),
    },
    instrumentIdentity: {
      currentlyAssigned: publicRows.length - missingIdentity,
      missing: missingIdentity,
      wouldAssignOnBackfill: wouldAssignIdentity,
      distinctIdentitiesAfterBackfill: assignedIdentities.size,
      note: "Dry-run only — no Neon writes. Version history preserved via sourceId + bytes hash; identity is additive metadata.",
    },
    unknownReclassifyDryRun: {
      scanned: unknowns.length,
      reclassable,
      byTarget: reclassDry,
      note: "Requires KF_MASS_PRECEDENT_LIVE_WRITE for live apply via reclassify-unknown-neon.ts",
    },
    mechanicCoverageSample: {
      sampledDocuments: sampled,
      sampleLimit,
      patternLibrarySize: allPatterns().length,
      documentsWithPattern: mechanicDocs,
      sharedCapacityRelationshipHits: sharedCapacityHits,
      aggregateCeilingOnlyHits: aggregateCeilingOnly,
      previouslyUnsupportedNowRepresented: ["anti-stacking", "grower-basket", "lesser-of-basket", "aggregate-ceiling"],
      note: "BYTEA text sample scan; discovery labels ≠ certified contractual truth.",
    },
    populations: CORPUS_POPULATION_REGISTRY,
    ckgEvaluationSnapshot: ckg
      ? {
          present: true,
          path: "docs/covenant-knowledge-generalization-benchmark/02-evaluation-results.json",
          hash: createHash("sha256").update(JSON.stringify(ckg)).digest("hex").slice(0, 16),
        }
      : { present: false },
    elapsedMs: Date.now() - started,
  };

  const rawPath = path.join(OUT_DIR, "agent1-cycle-2-corpus.raw.json");
  writeFileSync(rawPath, JSON.stringify(report, null, 2));

  const md = `# Agent 1 — Cycle 2 Corpus & Mechanics Report

Generated: ${report.generatedAt}

## Neon inventory (read-only)

| Metric | Value |
|---|---:|
| KnowledgeSources (total) | ${report.inventory.totalKnowledgeSources} |
| PUBLIC_SEC_EDGAR | ${report.inventory.publicSecEdgar} |
| DocumentByteObjects | ${report.inventory.documentByteObjects} |
| Distinct issuers | ${report.inventory.distinctIssuers} |
| Distinct byte hashes | ${report.inventory.distinctByteHashes} |
| Duplicate-hash groups | ${report.inventory.duplicateHashGroups} |
| V2 summaries | ${report.inventory.withV2Summaries} |
| Covenant summary items | ${report.inventory.covenantSummaryItems} |

### Representation levels
\`\`\`
${JSON.stringify(report.inventory.representationLevels, null, 2)}
\`\`\`

### Document class (public)
\`\`\`
${JSON.stringify(report.inventory.byClass, null, 2)}
\`\`\`

## Dedup / instrument identity

- Missing instrumentIdentity: **${report.instrumentIdentity.missing}**
- Distinct identities after dry-run backfill: **${report.instrumentIdentity.distinctIdentitiesAfterBackfill}**
- Duplicate byte-hash groups retained (version history not collapsed): **${report.inventory.duplicateHashGroups}**

## UNKNOWN reclassify (dry-run)

- Scanned UNKNOWN: **${report.unknownReclassifyDryRun.scanned}**
- Reclassable without bytes: **${report.unknownReclassifyDryRun.reclassable}**
- Targets: \`${JSON.stringify(report.unknownReclassifyDryRun.byTarget)}\`

## Mechanic coverage (BYTEA sample n=${report.mechanicCoverageSample.sampledDocuments})

Newly represented discovery patterns: ${report.mechanicCoverageSample.previouslyUnsupportedNowRepresented.join(", ")}

| Pattern | Docs (sample) |
|---|---:|
${Object.entries(report.mechanicCoverageSample.documentsWithPattern)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}

Shared-capacity relationship hits: **${report.mechanicCoverageSample.sharedCapacityRelationshipHits}**  
Aggregate-ceiling-only (not shared): **${report.mechanicCoverageSample.aggregateCeilingOnlyHits}**

## Populations preserved

| Package | Population |
|---|---|
${CORPUS_POPULATION_REGISTRY.map((p) => `| ${p.packageId} | ${p.population} |`).join("\n")}

## Costs

- Paid inference: **$0**
- Neon mutations: **0**

## Guardrails

- DISCOVERED ≠ VERIFIED ≠ CERTIFIED
- Precedent ≠ operative authority
- Bare aggregate amount ≠ shared capacity
`;

  writeFileSync(path.join(OUT_DIR, "AGENT1-CYCLE-2-REPORT.md"), md);
  console.log(JSON.stringify({ wrote: [rawPath, path.join(OUT_DIR, "AGENT1-CYCLE-2-REPORT.md")], summary: {
    publicSecEdgar: report.inventory.publicSecEdgar,
    distinctIssuers: report.inventory.distinctIssuers,
    summaryItems: report.inventory.covenantSummaryItems,
    reclassable: report.unknownReclassifyDryRun.reclassable,
    sampled: report.mechanicCoverageSample.sampledDocuments,
    sharedCapacityHits: report.mechanicCoverageSample.sharedCapacityRelationshipHits,
  } }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
