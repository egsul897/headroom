/**
 * Mass-precedent corpus inventory.
 * Committed bytes = available for immediate persist.
 * Manifest locators without bytes = HASH_AND_URL_ONLY (not acquired).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { scanOriginalByteCandidates } from "../consolidation/scan-original-bytes";
import {
  MASS_PRECEDENT_INVENTORY_SCHEMA,
  type CorpusInventoryItem,
} from "./types";

interface ManifestLocator {
  sourceId: string;
  accessionNumber?: string;
  exhibitFilename?: string;
  cik?: string;
  archivesUrl?: string;
  sourceUrl?: string;
  rawContentSha256?: string;
  byteSize?: number;
  corpusRole?: string;
  provenance?: string;
}

interface ExportSource {
  sourceId: string;
  issuerCik?: string;
  documentClass?: string;
  formType?: string;
  originalBytesHash?: string;
}

function loadManifest(repoRoot: string): ManifestLocator[] {
  const p = path.join(repoRoot, "docs/knowledge-factory/preservation/acquisition-manifest.json");
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8"));
  return (raw.locators ?? []) as ManifestLocator[];
}

function loadExportSources(repoRoot: string): ExportSource[] {
  const p = path.join(repoRoot, "docs/knowledge-factory/export/v1/sources.json");
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.sources ?? [];
  return list as ExportSource[];
}

function priorityScore(item: {
  channel: string;
  corpusRole?: string;
  documentClass?: string;
  byteSize?: number;
}): number {
  let score = 0;
  if (item.channel === "COMMITTED_BYTES") score += 1000;
  if (item.corpusRole === "FINANCING") score += 100;
  if (item.corpusRole === "FALSE_POSITIVE_EXHIBIT") score -= 500;
  const cls = (item.documentClass ?? "").toUpperCase();
  if (cls.includes("CREDIT") || cls.includes("INDENTURE") || cls.includes("AMENDMENT")) score += 50;
  if (cls.includes("RESTATEMENT")) score += 40;
  // Prefer mid-size exhibits (real agreements) over tiny wrappers
  if (item.byteSize && item.byteSize > 50_000) score += 30;
  if (item.byteSize && item.byteSize > 500_000) score += 20;
  return score;
}

export function buildMassPrecedentInventory(repoRoot = process.cwd()): {
  schemaVersion: typeof MASS_PRECEDENT_INVENTORY_SCHEMA;
  generatedAt: string;
  items: CorpusInventoryItem[];
  summary: {
    committedBytesAvailable: number;
    committedBytesTotal: number;
    manifestUrlOnly: number;
    financingLocators: number;
    falsePositiveLocators: number;
    distinctIssuersInManifest: number;
    exportSources: number;
  };
} {
  const committed = scanOriginalByteCandidates(repoRoot);
  const byHash = new Map(committed.map((c) => [c.originalBytesHash, c]));

  const exportById = new Map(loadExportSources(repoRoot).map((s) => [s.sourceId, s]));
  const items: CorpusInventoryItem[] = [];
  const seen = new Set<string>();

  for (const c of committed) {
    seen.add(c.sourceId);
    items.push({
      sourceId: c.sourceId,
      channel: "COMMITTED_BYTES",
      evidenceStatus: "BYTES_ON_DISK",
      originalBytesHash: c.originalBytesHash,
      byteSize: c.byteSize,
      localPath: c.localPath,
      issuerCik: c.issuerCik,
      documentClass: c.documentClass,
      formType: c.formType,
      corpusRole: c.label === "FIXTURE_AUTHENTIC_SEC" ? "FINANCING" : "RESEARCH",
      priorityScore: priorityScore({
        channel: "COMMITTED_BYTES",
        corpusRole: "FINANCING",
        documentClass: c.documentClass,
        byteSize: c.byteSize,
      }),
    });
  }

  const locators = loadManifest(repoRoot);
  const issuerSet = new Set<string>();
  let financing = 0;
  let falsePos = 0;
  let urlOnly = 0;

  for (const loc of locators) {
    if (loc.cik) issuerSet.add(loc.cik);
    if (loc.corpusRole === "FINANCING") financing += 1;
    if (loc.corpusRole === "FALSE_POSITIVE_EXHIBIT") falsePos += 1;

    if (seen.has(loc.sourceId)) continue;
    // Exact-hash dedupe against committed bytes
    if (loc.rawContentSha256 && byHash.has(loc.rawContentSha256)) {
      const hit = byHash.get(loc.rawContentSha256)!;
      items.push({
        sourceId: loc.sourceId,
        channel: "COMMITTED_BYTES",
        evidenceStatus: "BYTES_ON_DISK",
        originalBytesHash: hit.originalBytesHash,
        byteSize: hit.byteSize,
        localPath: hit.localPath,
        archivesUrl: loc.archivesUrl,
        issuerCik: loc.cik,
        corpusRole: loc.corpusRole,
        priorityScore: priorityScore({
          channel: "COMMITTED_BYTES",
          corpusRole: loc.corpusRole,
          byteSize: hit.byteSize,
        }),
      });
      seen.add(loc.sourceId);
      continue;
    }

    urlOnly += 1;
    const exp = exportById.get(loc.sourceId);
    items.push({
      sourceId: loc.sourceId,
      channel: "MANIFEST_URL_ONLY",
      evidenceStatus: "HASH_AND_URL_ONLY",
      originalBytesHash: loc.rawContentSha256,
      byteSize: loc.byteSize,
      archivesUrl: loc.archivesUrl ?? loc.sourceUrl,
      issuerCik: loc.cik ?? exp?.issuerCik,
      documentClass: exp?.documentClass,
      formType: exp?.formType,
      corpusRole: loc.corpusRole,
      priorityScore: priorityScore({
        channel: "MANIFEST_URL_ONLY",
        corpusRole: loc.corpusRole,
        documentClass: exp?.documentClass,
        byteSize: loc.byteSize,
      }),
    });
    seen.add(loc.sourceId);
  }

  items.sort((a, b) => b.priorityScore - a.priorityScore || a.sourceId.localeCompare(b.sourceId));

  return {
    schemaVersion: MASS_PRECEDENT_INVENTORY_SCHEMA,
    generatedAt: new Date().toISOString(),
    items,
    summary: {
      committedBytesAvailable: committed.length,
      committedBytesTotal: committed.reduce((a, c) => a + c.byteSize, 0),
      manifestUrlOnly: urlOnly,
      financingLocators: financing,
      falsePositiveLocators: falsePos,
      distinctIssuersInManifest: issuerSet.size,
      exportSources: exportById.size,
    },
  };
}
