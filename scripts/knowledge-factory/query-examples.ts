#!/usr/bin/env tsx
/**
 * Query source-backed examples from the knowledge corpus.
 *
 * Usage:
 *   npx tsx scripts/knowledge-factory/query-examples.ts --family INDEBTEDNESS
 *   npx tsx scripts/knowledge-factory/query-examples.ts --named
 *   npx tsx scripts/knowledge-factory/query-examples.ts --text "Available Amount"
 */

import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { searchKnowledge, runExampleQueries, traverseKnowledgeGraph } from "../../lib/knowledge-factory/search/query";
import type { KnowledgeTaxonomyFamily } from "../../lib/knowledge-factory/types";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  if (flag("--named")) {
    console.log(JSON.stringify(runExampleQueries(store), null, 2));
    return;
  }
  const family = arg("--family") as KnowledgeTaxonomyFamily | undefined;
  const text = arg("--text");
  const term = arg("--term");
  const candidateId = arg("--traverse");
  if (candidateId) {
    console.log(JSON.stringify(traverseKnowledgeGraph(store, candidateId), null, 2));
    return;
  }
  const hits = searchKnowledge(store, {
    covenantFamily: family,
    provisionText: text,
    definedTerm: term,
    issuerTicker: arg("--ticker"),
    limit: Number(arg("--limit") ?? "20"),
  });
  console.log(JSON.stringify(hits, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
