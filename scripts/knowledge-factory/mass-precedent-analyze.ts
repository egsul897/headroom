/**
 * Run analysis pipelines on committed authentic bytes (local, no Neon write).
 *
 *   npm run kf:mass-precedent-analyze -- --limit=3
 *   npm run kf:mass-precedent-analyze -- --source-id=edgar:0001140361-26-003087:ef20064499_ex10-1.htm
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scanOriginalByteCandidates } from "../../lib/knowledge-factory/consolidation";
import {
  analyzeCommittedSource,
  analyzeBatchCommitted,
} from "../../lib/knowledge-factory/mass-precedent";

const OUT_DIR = "docs/knowledge-factory/mass-precedent";

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const sourceId = argValue("--source-id");
  const limit = Number(argValue("--limit") ?? "3");

  mkdirSync(path.join(OUT_DIR, "runs"), { recursive: true });

  if (sourceId) {
    const r = await analyzeCommittedSource({ sourceId });
    console.log(JSON.stringify({ sourceId, ok: r.ok, counts: r.counts, records: r.records }, null, 2));
    return;
  }

  const candidates = scanOriginalByteCandidates()
    .slice()
    .sort((a, b) => b.byteSize - a.byteSize);
  const ids = candidates.slice(0, Number.isFinite(limit) ? limit : 3).map((c) => c.sourceId);
  const summary = await analyzeBatchCommitted({ sourceIds: ids });

  const board = {
    schemaVersion: "knowledge-factory.mass-precedent-analyze-summary.v1",
    generatedAt: new Date().toISOString(),
    ...summary,
    sourceIds: ids,
    note: "Local analysis only — no Neon writes. promotedToLegalTruth remains 0.",
  };
  writeFileSync(path.join(OUT_DIR, "analyze-summary.json"), JSON.stringify(board, null, 2) + "\n");
  console.log(JSON.stringify(board, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
