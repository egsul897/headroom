#!/usr/bin/env tsx
/**
 * Download discovered EDGAR documents (idempotent, rate-limited).
 *
 * Usage:
 *   npx tsx scripts/knowledge-factory/download-documents.ts --ticker AAL --max 5
 *   npx tsx scripts/knowledge-factory/download-documents.ts --pilot --max-per-issuer 2 --issuers 20
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

  if (flag("--pilot")) {
    const maxPer = Number(arg("--max-per-issuer") ?? "2");
    const issuerCount = Number(arg("--issuers") ?? "20");
    const seeds = stratifiedPilotPlan(issuerCount);
    const summary = [];
    for (const seed of seeds) {
      try {
        const r = await ingestIssuerFromEdgar(store, client, { ticker: seed.ticker }, { maxDocuments: maxPer, filingLimit: 30 });
        summary.push(r);
        console.log(`${seed.ticker}: discovered=${r.discovered} downloaded=${r.downloaded} errors=${r.errors.length}`);
      } catch (err) {
        summary.push({ ticker: seed.ticker, error: err instanceof Error ? err.message : String(err) });
        console.warn(`${seed.ticker}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const stats = finalizeCorpusIndex(store);
    store.writeJson("download-pilot-summary.json", { summary, stats });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const ticker = arg("--ticker");
  const cik = arg("--cik");
  const max = Number(arg("--max") ?? "5");
  if (!ticker && !cik) {
    console.error("Provide --ticker/--cik or --pilot");
    process.exit(1);
  }
  const r = await ingestIssuerFromEdgar(store, client, { ticker, cik }, { maxDocuments: max });
  const stats = finalizeCorpusIndex(store);
  console.log(JSON.stringify({ result: r, stats }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
