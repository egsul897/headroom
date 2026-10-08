/**
 * Adapter for WS-EHB EDGAR Historical Backfill published acquisition queue.
 *
 * PCI does not download EDGAR exhibits. This adapter only reports queue
 * availability / counts so corpus expansion can coordinate without duplicating
 * the backfill engine.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PeerLoadResult } from "./types";

export interface AcquisitionQueueItemView {
  queueId: string;
  cik: string;
  accessionNumber: string;
  documentKind: string;
  sourceUri: string;
  status: string;
  relevanceScore?: number;
}

export interface EdgarBackfillView {
  itemCount: number;
  distinctCiks: number;
  queued: number;
  items: AcquisitionQueueItemView[];
}

const DEFAULT_PATHS = [
  "data/edgar-historical-backfill/acquisition-queue.json",
  "docs/edgar-historical-backfill/acquisition-queue.json",
  "lib/precedent-comparison/adapters/fixtures/acquisition-queue.sample.json",
];

export function loadEdgarAcquisitionQueue(baseDir: string = process.cwd(), extraPaths: string[] = []): PeerLoadResult<EdgarBackfillView> {
  const tried: string[] = [];
  let sampleFallback: PeerLoadResult<EdgarBackfillView> | null = null;
  for (const rel of [...extraPaths, ...DEFAULT_PATHS]) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown> | AcquisitionQueueItemView[];
      const items = Array.isArray(raw) ? raw : ((raw.items as AcquisitionQueueItemView[] | undefined) ?? []);
      const ciks = new Set(items.map((i) => i.cik));
      const isSample = rel.includes("adapters/fixtures/") || items.every((i) => i.cik === "0000000000" || i.queueId.startsWith("sample-"));
      const view: PeerLoadResult<EdgarBackfillView> = {
        peer: "WS-EHB",
        availability: isSample ? "UNAVAILABLE" : "AVAILABLE",
        pathTried: tried,
        data: {
          itemCount: items.length,
          distinctCiks: ciks.size,
          queued: items.filter((i) => i.status === "QUEUED").length,
          items: isSample ? [] : items,
        },
        note: isSample
          ? `EHB sample schema fixture only at ${rel} — live acquisition-queue.json not delivered; 100-agreement target still blocked`
          : `EHB queue visible (${items.length} items, ${ciks.size} CIKs) — PCI will not fetch; CKF owns acquisition`,
      };
      if (isSample) {
        sampleFallback = view;
        continue;
      }
      return view;
    } catch (err) {
      return {
        peer: "WS-EHB",
        availability: "SCHEMA_MISMATCH",
        pathTried: tried,
        data: null,
        note: `failed to parse ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  if (sampleFallback) return sampleFallback;
  return {
    peer: "WS-EHB",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "EDGAR backfill queue not in worktree — 100-agreement target blocked on WS-EHB/WS-CKF delivery",
  };
}
