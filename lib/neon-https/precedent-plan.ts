/**
 * Offline precedent plan. No database connection.
 * Counts are in-batch deduped. Live import also skips sha256 / accession+filename
 * already stored in Neon.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { scanOriginalByteCandidates } from "../knowledge-factory/consolidation/scan-original-bytes";
import { summarizeCorpusPlan, type CorpusPlanSummary } from "./corpus-catalog";

const EXPORT_FILES = [
  "sources.json",
  "structural-nodes.json",
  "covenant-candidates.json",
  "definitions.json",
  "dependency-edges.json",
  "conditions-exceptions.json",
  "document-relationships.json",
  "unresolved-uncertainties.json",
] as const;

export type OfflinePrecedentPlan = {
  generatedAt: string;
  dryRun: true;
  liveWrite: false;
  note: string;
  massPrecedentCandidates: number;
  exportV1: Record<string, number>;
  corpus: CorpusPlanSummary;
};

export function buildOfflinePrecedentPlan(repoRoot: string = process.cwd()): OfflinePrecedentPlan {
  const exportDir = path.join(repoRoot, "docs/knowledge-factory/export/v1");
  const exportV1: Record<string, number> = {};
  for (const name of EXPORT_FILES) {
    const abs = path.join(exportDir, name);
    if (!existsSync(abs)) {
      exportV1[name] = 0;
      continue;
    }
    const parsed = JSON.parse(readFileSync(abs, "utf8")) as unknown;
    exportV1[name] = Array.isArray(parsed) ? parsed.length : 0;
  }
  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    liveWrite: false,
    note: "In-batch dedupe by sha256 and accession+filename. Live Neon import also skips rows already stored. No bytes are invented. Knife River (CIK 0001955520 / KNF) is excluded.",
    massPrecedentCandidates: scanOriginalByteCandidates(repoRoot).length,
    exportV1,
    corpus: summarizeCorpusPlan(repoRoot),
  };
}
