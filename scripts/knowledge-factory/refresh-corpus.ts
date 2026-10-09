#!/usr/bin/env tsx
/**
 * Incremental discovery/download for issuers already in the corpus (or pilot plan).
 * Idempotent resume via checkpoints. Does not enable uncontrolled background jobs.
 *
 * Usage:
 *   npx tsx scripts/knowledge-factory/refresh-corpus.ts --tickers AAL,F,CNMD --max 3
 *   npx tsx scripts/knowledge-factory/refresh-corpus.ts --since 2024-01-01 --pilot --issuers 10 --max 1
 */

import path from "node:path";
import { EdgarKnowledgeClient } from "../../lib/knowledge-factory/edgar/client";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { ingestIssuerFromEdgar, finalizeCorpusIndex } from "../../lib/knowledge-factory/pipeline/run";
import { stratifiedPilotPlan } from "../../lib/knowledge-factory/corpus/issuer-sample";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const client = new EdgarKnowledgeClient({
    cacheDir: path.join(store.paths.cache, "sec"),
    logDir: path.join(store.paths.root, "logs"),
  });
  const since = arg("--since");
  const max = Number(arg("--max") ?? "2");
  let tickers: string[] = [];
  if (flag("--pilot")) {
    tickers = stratifiedPilotPlan(Number(arg("--issuers") ?? "10")).map((s) => s.ticker);
  } else if (arg("--tickers")) {
    tickers = arg("--tickers")!.split(",").map((t) => t.trim()).filter(Boolean);
  } else {
    tickers = [...new Set(store.listSources().map((s) => s.issuerTicker).filter(Boolean))] as string[];
  }

  const summary = [];
  for (const ticker of tickers) {
    try {
      const r = await ingestIssuerFromEdgar(store, client, { ticker }, { maxDocuments: max, filingLimit: 25, since });
      summary.push(r);
      console.log(`refresh ${ticker}: +${r.downloaded} (discovered ${r.discovered})`);
    } catch (err) {
      summary.push({ ticker, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const stats = finalizeCorpusIndex(store);
  store.writeJson("refresh-last.json", { at: new Date().toISOString(), since, summary, stats });
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
