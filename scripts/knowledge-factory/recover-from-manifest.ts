#!/usr/bin/env tsx
/**
 * Deterministic recovery / re-ingestion from the committed acquisition manifest.
 *
 * Does not claim durability. Re-fetches SEC bytes, verifies SHA-256, upserts
 * via processAcquiredDocument (exact-byte dedupe).
 *
 * Usage:
 *   HEADROOM_SEC_FETCH_OWNER=WS-CKF npx tsx scripts/knowledge-factory/recover-from-manifest.ts
 *   npx tsx scripts/knowledge-factory/recover-from-manifest.ts --dry-run
 *   npx tsx scripts/knowledge-factory/recover-from-manifest.ts --limit 3
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { EdgarKnowledgeClient } from "../../lib/knowledge-factory/edgar/client";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument, finalizeCorpusIndex } from "../../lib/knowledge-factory/pipeline/run";
import { hashBytes } from "../../lib/knowledge-factory/pipeline/text";
import type { AcquisitionManifest } from "../../lib/knowledge-factory/preservation/acquisition-manifest";
import type { DiscoveredFilingDocument } from "../../lib/knowledge-factory/types";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = flag("--dry-run");
  const limit = Number(arg("--limit") ?? "0") || undefined;
  const manifestPath = path.resolve(
    arg("--manifest") ?? "docs/knowledge-factory/preservation/acquisition-manifest.json",
  );
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing acquisition manifest at ${manifestPath}. Run phase3-preserve-and-export.ts first.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AcquisitionManifest;
  process.env.HEADROOM_SEC_FETCH_OWNER = process.env.HEADROOM_SEC_FETCH_OWNER || "WS-CKF";

  const store = new CorpusStore(defaultCorpusPaths());
  const client = new EdgarKnowledgeClient({
    cacheDir: path.join(store.paths.cache, "sec"),
    logDir: path.join(store.paths.root, "logs"),
    cacheOnly: flag("--cache-only"),
  });

  const locators = limit ? manifest.locators.slice(0, limit) : manifest.locators;
  const report = {
    generatedAt: new Date().toISOString(),
    manifestContentDigest: manifest.contentDigest,
    durabilityClaim: "NONE" as const,
    dryRun,
    attempted: 0,
    hashVerified: 0,
    acquired: 0,
    duplicates: 0,
    hashMismatches: [] as string[],
    errors: [] as string[],
    sourceCountBefore: store.listSources().length,
    sourceCountAfter: 0,
  };

  for (const loc of locators) {
    report.attempted += 1;
    if (dryRun) continue;
    const discovered: DiscoveredFilingDocument = {
      sourceId: loc.sourceId,
      filing: {
        accessionNumber: loc.accessionNumber,
        formType: "8-K",
        filingDate: loc.acquisitionTimestamp.slice(0, 10),
        issuer: { cik: loc.cik },
      },
      exhibit: {
        filename: loc.exhibitFilename,
        description: loc.exhibitFilename,
        exhibitType: "EX-10",
        sourceUrl: loc.archivesUrl ?? loc.sourceUrl,
      },
      discoverySignals: ["acquisition-manifest-recovery"],
    };
    try {
      const { bytes, contentHash } = await client.fetchDocument(discovered);
      const actual = hashBytes(bytes);
      if (actual !== loc.rawContentSha256 && contentHash !== loc.rawContentSha256) {
        report.hashMismatches.push(`${loc.sourceId}: expected ${loc.rawContentSha256} got ${actual}`);
        continue;
      }
      report.hashVerified += 1;
      const result = await processAcquiredDocument(store, {
        discovered,
        bytes,
        contentHash: loc.rawContentSha256,
        provenance: loc.provenance,
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      });
      if (result.wasDuplicate) report.duplicates += 1;
      else report.acquired += 1;
    } catch (err) {
      report.errors.push(`${loc.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!dryRun) finalizeCorpusIndex(store);
  report.sourceCountAfter = store.listSources().length;

  const outDir = path.resolve("docs/knowledge-factory/preservation");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "recovery-run-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
