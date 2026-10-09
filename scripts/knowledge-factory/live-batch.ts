#!/usr/bin/env tsx
/**
 * High-limit live EDGAR acquisition batch.
 * Usage: npx tsx scripts/knowledge-factory/live-batch.ts --tickers F,AAL,SBUX --max 5 --filing-limit 120
 */

import path from "node:path";
import { EdgarKnowledgeClient } from "../../lib/knowledge-factory/edgar/client";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { ingestIssuerFromEdgar, finalizeCorpusIndex } from "../../lib/knowledge-factory/pipeline/run";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const client = new EdgarKnowledgeClient({
    cacheDir: path.join(store.paths.cache, "sec"),
    logDir: path.join(store.paths.root, "logs"),
  });
  const tickers = (arg("--tickers") ??
    "F,AAL,UAL,DAL,GM,URI,CHWY,BALL,WBD,PARA,TMUS,NFLX,GPK,IR,BSX,YUM,DRI,CCK,SBUX,CNMD,LYV,ORCL,IBM,T,VZ,AMT,CCI,BA,LMT,HON")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const max = Number(arg("--max") ?? "5");
  const filingLimit = Number(arg("--filing-limit") ?? "120");
  const summary = [];
  const started = Date.now();
  for (const ticker of tickers) {
    try {
      const r = await ingestIssuerFromEdgar(store, client, { ticker }, { maxDocuments: max, filingLimit });
      summary.push(r);
      console.log(`${ticker}: discovered=${r.discovered} downloaded=${r.downloaded} errors=${r.errors.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${ticker}: ERROR ${msg}`);
      summary.push({ ticker, error: msg });
    }
  }
  const stats = finalizeCorpusIndex(store);
  store.writeJson("live-batch-high-limit.json", { wallMs: Date.now() - started, summary, stats });
  console.log(JSON.stringify({ wallMs: Date.now() - started, stats }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
