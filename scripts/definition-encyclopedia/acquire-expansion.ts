#!/usr/bin/env tsx
/**
 * Phase-2 corpus expansion acquisition (WS-DEF).
 *
 * 1) Prefer WS-EHB acquisition-queue.json when present
 * 2) Fall back to EdgarConnector discovery for diversified tickers
 *
 * Usage:
 *   npx tsx scripts/definition-encyclopedia/acquire-expansion.ts
 *   npx tsx scripts/definition-encyclopedia/acquire-expansion.ts --max-issuers 50 --max-docs 80
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  EXPANSION_TICKER_UNIVERSE,
  acquireFromEhbQueue,
  acquireViaEdgarConnector,
  type AcquiredDocumentMeta,
} from "../../lib/definition-encyclopedia/sec-acquire";
import { loadAcquiredSourceSpecs } from "../../lib/definition-encyclopedia/acquired-sources";

function parseArg(name: string, fallback: number): number {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  return fallback;
}

function findEhbQueues(repoRoot: string): string[] {
  const roots = [
    resolve(repoRoot, "data/edgar-historical-backfill"),
    resolve("/tmp/ehb-wt/data/edgar-historical-backfill"),
  ];
  const found: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) stack.push(p);
        else if (ent.name === "acquisition-queue.json") found.push(p);
      }
    }
  }
  return found;
}

async function main() {
  const repoRoot = resolve(__dirname, "../..");
  const maxIssuers = parseArg("--max-issuers", 55);
  const maxDocs = parseArg("--max-docs", 90);
  mkdirSync(resolve(repoRoot, "data/definition-encyclopedia"), { recursive: true });

  // Resume from on-disk acquisitions so repeated waves expand issuers instead of redoing work.
  const prior = loadAcquiredSourceSpecs(repoRoot).metas;
  const acquired: AcquiredDocumentMeta[] = [...prior];
  const haveCiks = new Set<string>(prior.map((m) => m.issuerCik));
  const queues = [...new Set(findEhbQueues(repoRoot))];
  console.log(
    JSON.stringify(
      { queuesFound: queues, maxIssuers, maxDocs, priorDocuments: prior.length, priorIssuers: haveCiks.size },
      null,
      2,
    ),
  );

  for (const q of queues) {
    const batch = await acquireFromEhbQueue({
      repoRoot,
      queuePath: q,
      maxIssuers,
      maxDocs: maxDocs - acquired.length,
    });
    let added = 0;
    for (const m of batch) {
      if (haveCiks.has(m.issuerCik)) continue;
      acquired.push(m);
      haveCiks.add(m.issuerCik);
      added += 1;
      if (acquired.length >= maxDocs) break;
    }
    console.log(`EHB queue ${q}: batch=${batch.length} newlyAdded=${added} totalIssuers=${haveCiks.size}`);
    if (acquired.length >= maxDocs || haveCiks.size >= maxIssuers) break;
  }

  if (haveCiks.size < maxIssuers && acquired.length < maxDocs) {
    const alreadyTickers = new Set(acquired.map((a) => (a.issuerTicker ?? "").toUpperCase()).filter(Boolean));
    const tickers = EXPANSION_TICKER_UNIVERSE.filter((t) => !alreadyTickers.has(t));
    console.log(
      `EdgarConnector expansion for up to ${maxIssuers - haveCiks.size} more issuers (have ${haveCiks.size} issuers / ${acquired.length} docs)...`,
    );
    const more = await acquireViaEdgarConnector({
      repoRoot,
      tickers: [...tickers],
      maxIssuers: Math.max(0, maxIssuers - haveCiks.size),
      maxDocsPerIssuer: 1,
      filingLimit: 22,
    });
    for (const m of more) {
      if (haveCiks.has(m.issuerCik)) continue;
      acquired.push(m);
      haveCiks.add(m.issuerCik);
      if (acquired.length >= maxDocs || haveCiks.size >= maxIssuers) break;
    }
  }

  const summary = {
    acquiredDocuments: acquired.length,
    distinctIssuers: new Set(acquired.map((a) => a.issuerCik)).size,
    byDiscoverySource: acquired.reduce(
      (acc, a) => {
        acc[a.discoverySource] = (acc[a.discoverySource] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    tickers: [...new Set(acquired.map((a) => a.issuerTicker).filter(Boolean))],
  };
  writeFileSync(
    resolve(repoRoot, "data/definition-encyclopedia/acquisition-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  // Git-safe copy of summary under exclusive docs tree
  writeFileSync(
    resolve(repoRoot, "docs/definition-encyclopedia/acquisition-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
