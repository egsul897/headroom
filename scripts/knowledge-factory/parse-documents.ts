#!/usr/bin/env tsx
/**
 * Re-run text/structure/candidate extraction over already-acquired bytes.
 */

import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument, finalizeCorpusIndex } from "../../lib/knowledge-factory/pipeline/run";
import type { DiscoveredFilingDocument } from "../../lib/knowledge-factory/types";

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const sources = store.listSources();
  let reparsed = 0;
  for (const s of sources) {
    const bytes = store.readBytes(s.originalBytesHash);
    if (!bytes) {
      console.warn(`missing bytes for ${s.sourceId}`);
      continue;
    }
    const discovered: DiscoveredFilingDocument = {
      sourceId: s.sourceId,
      filing: {
        accessionNumber: s.accessionNumber,
        formType: s.formType,
        filingDate: s.filingDate,
        issuer: { cik: s.issuerCik, ticker: s.issuerTicker, name: s.issuerName },
      },
      exhibit: {
        filename: s.exhibitFilename,
        description: s.documentTitle,
        exhibitType: "EX-10",
        sourceUrl: s.sourceUrl,
      },
      discoverySignals: [],
    };
    await processAcquiredDocument(store, {
      discovered,
      bytes,
      contentHash: s.originalBytesHash,
      provenance: s.provenance,
      usageRightsReviewStatus: s.usageRightsReviewStatus,
    });
    reparsed += 1;
    console.log(`reparsed ${s.sourceId}`);
  }
  const stats = finalizeCorpusIndex(store);
  console.log(JSON.stringify({ reparsed, stats }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
