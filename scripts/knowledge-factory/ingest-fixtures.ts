#!/usr/bin/env tsx
/**
 * Build a queryable corpus from recorded public fixtures (no network).
 * Use when SEC access is unavailable or for deterministic CI.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { ingestFixtureDocument, finalizeCorpusIndex } from "../../lib/knowledge-factory/pipeline/run";
import { auditCorpusQuality } from "../../lib/knowledge-factory/audit/corpus-quality";
import { buildReviewerDataset } from "../../lib/knowledge-factory/corpus/reviewer-dataset";
import { runExampleQueries } from "../../lib/knowledge-factory/search/query";
import { runIntegrityChecks } from "../../lib/knowledge-factory/integrity/checks";
import { modelCorpusEconomics, summarizeCosts } from "../../lib/knowledge-factory/cost/ledger";

const ROOT = path.resolve("tests/fixtures/unseen-packages");

const PACKAGES: { sourceId: string; rel: string; ticker: string; cik: string; title: string; maxChars?: number }[] = [
  { sourceId: "fixture:fwrg-article6", rel: "fwrg-2021-credit-agreement/article-6-negative-covenants.txt", ticker: "FWRG", cik: "0001789940", title: "Credit Agreement — Article VI Negative Covenants" },
  { sourceId: "fixture:fwrg-defs", rel: "fwrg-2021-credit-agreement/definitions-excerpt.txt", ticker: "FWRG", cik: "0001789940", title: "Credit Agreement — Definitions Excerpt" },
  { sourceId: "fixture:lsb-article6", rel: "lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", ticker: "LXU", cik: "0000609371", title: "ABL Credit Agreement — Article VI" },
  { sourceId: "fixture:lsb-defs", rel: "lsb-2023-abl-credit-agreement/definitions-excerpt.txt", ticker: "LXU", cik: "0000609371", title: "ABL Credit Agreement — Definitions" },
  { sourceId: "fixture:lsb-intercreditor", rel: "lsb-2023-abl-credit-agreement/intercreditor-joinder.txt", ticker: "LXU", cik: "0000609371", title: "Intercreditor Joinder" },
  { sourceId: "fixture:conmed-article7", rel: "conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt", ticker: "CNMD", cik: "0000816956", title: "Credit Agreement — Article VII" },
  { sourceId: "fixture:conmed-defs", rel: "conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt", ticker: "CNMD", cik: "0000816956", title: "Credit Agreement — Definitions" },
  { sourceId: "fixture:conmed-amendment", rel: "conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt", ticker: "CNMD", cik: "0000816956", title: "First Omnibus Amendment" },
  { sourceId: "fixture:conmed-gsa", rel: "conmed-2025-credit-facility/curated/guarantee-and-collateral-agreement-full.txt", ticker: "CNMD", cik: "0000816956", title: "Guarantee and Collateral Agreement" },
  { sourceId: "fixture:conmed-second-amd", rel: "conmed-2025-credit-facility/curated/second-amendment-2022-full.txt", ticker: "CNMD", cik: "0000816956", title: "Second Amendment" },
  { sourceId: "fixture:chwy", rel: "chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", ticker: "CHWY", cik: "0001766502", title: "Chewy Credit Agreement", maxChars: 250_000 },
  { sourceId: "fixture:gibraltar", rel: "gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt", ticker: "ROCK", cik: "0000920230", title: "Gibraltar Credit Agreement", maxChars: 250_000 },
];

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const started = Date.now();
  let ok = 0;
  const errors: string[] = [];

  for (const p of PACKAGES) {
    const full = path.join(ROOT, p.rel);
    if (!existsSync(full)) {
      errors.push(`missing ${p.rel}`);
      continue;
    }
    let text = readFileSync(full, "utf8");
    if (p.maxChars) text = text.slice(0, p.maxChars);
    try {
      await ingestFixtureDocument(store, {
        sourceId: p.sourceId,
        issuerCik: p.cik,
        issuerTicker: p.ticker,
        title: p.title,
        text,
      });
      ok += 1;
      console.log(`ingested ${p.sourceId} (${text.length} chars)`);
    } catch (err) {
      errors.push(`${p.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const stats = finalizeCorpusIndex(store);
  stats.measuredProcessingMs = Date.now() - started;
  store.writeJson("corpus-stats.json", stats);

  const audit = auditCorpusQuality(store);
  store.writeJson("corpus-quality-audit.json", audit);
  const reviewer = buildReviewerDataset(store, 100);
  store.writeJson("reviewer-dataset.json", reviewer);
  store.writeJson("example-queries.json", runExampleQueries(store));
  store.writeJson("integrity.json", runIntegrityChecks(store));

  const costs = summarizeCosts(store.readCostLedger());
  const economics = modelCorpusEconomics({
    storageBytes: Math.max(1, Math.round(costs.storageBytes / Math.max(1, ok))),
    parseMs: Math.max(1, Math.round(costs.parsingMs / Math.max(1, ok))),
    estimatedModelTokensIfUsed: 2500,
    estimatedModelUsdPer1kTokens: 0.003,
    reviewerMinutes: 20,
    reviewerUsdPerHour: 250,
  });
  store.writeJson("corpus-economics.json", { measuredPerDocProxies: costs, modeled: economics, actualPaidSpendUsd: 0 });

  // Git-safe manifests (no bytes)
  const outDir = path.resolve("docs/knowledge-factory/manifests");
  mkdirSync(outDir, { recursive: true });
  for (const name of ["corpus-stats.json", "corpus-quality-audit.json", "corpus-economics.json", "example-queries.json"]) {
    const src = path.join(store.paths.manifests, name);
    if (existsSync(src)) copyFileSync(src, path.join(outDir, name));
  }
  writeFileSync(
    path.join(outDir, "fixture-ingest-report.json"),
    JSON.stringify({ ok, errors, stats, limitation: "Fixture-backed corpus; live EDGAR pilot is separate." }, null, 2),
  );

  console.log(JSON.stringify({ ok, errors, stats }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
