#!/usr/bin/env tsx
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { modelCorpusEconomics, summarizeCosts } from "../../lib/knowledge-factory/cost/ledger";

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const sources = store.listSources();
  const costs = summarizeCosts(store.readCostLedger());
  const n = Math.max(1, sources.length);
  const modeled = modelCorpusEconomics({
    storageBytes: Math.max(50_000, Math.round(costs.storageBytes / n)),
    parseMs: Math.max(5, Math.round(costs.parsingMs / n)),
    estimatedModelTokensIfUsed: 2500,
    estimatedModelUsdPer1kTokens: 0.003,
    reviewerMinutes: 20,
    reviewerUsdPerHour: 250,
  });
  const report = {
    measured: {
      documents: sources.length,
      ...costs,
      actualPaidSpendUsd: costs.actualPaidUsd,
      note: "Actual paid AI provider spend is tracked separately and is currently $0 (providers disabled).",
    },
    modeledScales: modeled,
    disclaimer: "Modeled figures are explicit estimates from measured per-document proxies — not a claimed unmeasured cost advantage.",
  };
  store.writeJson("corpus-economics.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
