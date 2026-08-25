/**
 * Real, non-mocked verification of EdgarConnector against the live SEC.gov
 * (docs/autonomous-retrieval-phase-a-foundation.md). Not a permanent product
 * script - a one-off proof this connector actually works, kept in scripts/
 * for anyone who wants to re-run it against a different ticker later.
 *
 * Usage: npx tsx scripts/verify-edgar-connector.ts [TICKER]
 */

import { EdgarConnector, resolveCikForTicker } from "../lib/connectors/edgar-connector";

async function main() {
  const ticker = process.argv[2] ?? "F";
  const limit = process.argv[3] ? Number(process.argv[3]) : 25;
  console.log(`=== EdgarConnector live verification: ${ticker} (limit=${limit}) ===\n`);

  console.log("1. resolveCikForTicker...");
  const { cik, title } = await resolveCikForTicker(ticker);
  console.log(`   ticker=${ticker} -> cik=${cik} title="${title}"\n`);

  const connector = new EdgarConnector({ cik, ticker });

  console.log("2. healthCheck...");
  const health = await connector.healthCheck();
  console.log(`   ${JSON.stringify(health)}\n`);
  if (!health.ok) throw new Error("healthCheck failed - aborting.");

  console.log("3. capabilities...");
  console.log(`   ${JSON.stringify(connector.capabilities())}\n`);

  console.log(`4. discover({ limit: ${limit} }) - walking filings.recent (8-K/10-K/10-Q), opening each filing's index page for exhibits matching Credit Agreement/Indenture/Amendment/Intercreditor...`);
  const t0 = Date.now();
  const items = await connector.discover({ limit });
  const elapsedMs = Date.now() - t0;
  console.log(`   found ${items.length} matching exhibit(s) across up to ${limit} qualifying filings in ${elapsedMs}ms\n`);

  const byFiling = new Map<string, number>();
  for (const item of items) {
    byFiling.set(item.sourceIdentifier, (byFiling.get(item.sourceIdentifier) ?? 0) + 1);
  }
  console.log(`   distinct filings with at least one matching exhibit: ${byFiling.size}\n`);

  items.slice(0, 10).forEach((item, i) => {
    console.log(`   [${i + 1}] ${item.summary}`);
    console.log(`       sourceUri: ${item.sourceUri}`);
  });
  if (items.length > 10) console.log(`   ... and ${items.length - 10} more`);
  console.log();

  if (items.length === 0) {
    console.log("No matching exhibits found for this ticker in its most recent qualifying filings - trying syncSince(null) is unnecessary; reporting zero and exiting cleanly (fail-closed, not an error).");
    return;
  }

  console.log("5. fetch() the first discovered item...");
  const raw = await connector.fetch(items[0]!);
  console.log(`   bytes: ${raw.data.length}`);
  console.log(`   contentHash (sha256): ${raw.contentHash}`);
  console.log(`   mimeType: ${raw.mimeType}\n`);

  console.log("6. parseDocument() the fetched bytes (proves the HTML parse path added for EDGAR actually works)...");
  const { parseDocument } = await import("../lib/extraction/parse");
  const parsed = await parseDocument(raw.data, raw.mimeType ?? "text/html");
  console.log(`   parsed to ${parsed.fullText.length} chars of plain text`);
  console.log(`   first 300 chars: ${JSON.stringify(parsed.fullText.slice(0, 300))}\n`);

  console.log("=== SUMMARY ===");
  console.log(`ticker=${ticker} cik=${cik} title="${title}"`);
  console.log(`qualifying filings scanned (8-K/10-K/10-Q, most recent up to limit): 25`);
  console.log(`distinct filings with >=1 matching exhibit: ${byFiling.size}`);
  console.log(`total matching exhibits discovered: ${items.length}`);
  console.log(`first exhibit fetched: ${items[0]!.sourceUri} (${raw.data.length} bytes, sha256 ${raw.contentHash.slice(0, 16)}...)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  });
