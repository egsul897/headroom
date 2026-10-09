#!/usr/bin/env tsx
/**
 * Discover debt-related EDGAR exhibits for one or more issuers.
 *
 * Usage:
 *   npx tsx scripts/knowledge-factory/discover-documents.ts --ticker AAL --limit 30
 *   npx tsx scripts/knowledge-factory/discover-documents.ts --cik 0000006201 --limit 30
 *   npx tsx scripts/knowledge-factory/discover-documents.ts --pilot --limit-per-issuer 10
 */

import path from "node:path";
import { EdgarKnowledgeClient } from "../../lib/knowledge-factory/edgar/client";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
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

  const filingLimit = Number(arg("--limit") ?? "40");
  const results: unknown[] = [];

  if (flag("--pilot")) {
    const per = Number(arg("--limit-per-issuer") ?? "15");
    for (const seed of stratifiedPilotPlan(100)) {
      try {
        const issuer = await client.resolveCikForTicker(seed.ticker);
        const docs = await client.discoverForCik(issuer.cik, { filingLimit: per });
        results.push({ ticker: seed.ticker, cik: issuer.cik, discovered: docs.length, sample: docs.slice(0, 3) });
        console.log(`${seed.ticker}: ${docs.length} debt-signal exhibits`);
      } catch (err) {
        results.push({ ticker: seed.ticker, error: err instanceof Error ? err.message : String(err) });
        console.warn(`${seed.ticker}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    const ticker = arg("--ticker");
    const cik = arg("--cik");
    if (!ticker && !cik) {
      console.error("Provide --ticker, --cik, or --pilot");
      process.exit(1);
    }
    const issuerCik = cik ?? (await client.resolveCikForTicker(ticker!)).cik;
    const docs = await client.discoverForCik(issuerCik, { filingLimit });
    results.push(...docs);
    console.log(JSON.stringify(docs, null, 2));
  }

  store.writeJson("discover-last.json", { at: new Date().toISOString(), results });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
