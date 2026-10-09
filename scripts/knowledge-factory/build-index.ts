#!/usr/bin/env tsx
/** Rebuild relationship graph, queues, and corpus stats from acquired sources. */

import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { finalizeCorpusIndex } from "../../lib/knowledge-factory/pipeline/run";
import { auditCorpusQuality } from "../../lib/knowledge-factory/audit/corpus-quality";
import { buildReviewerDataset } from "../../lib/knowledge-factory/corpus/reviewer-dataset";
import { runExampleQueries } from "../../lib/knowledge-factory/search/query";

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const stats = finalizeCorpusIndex(store);
  store.writeJson("corpus-quality-audit.json", auditCorpusQuality(store));
  store.writeJson("reviewer-dataset.json", buildReviewerDataset(store, 200));
  store.writeJson("example-queries.json", runExampleQueries(store));
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
