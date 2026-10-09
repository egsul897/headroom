import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import type { DiscoveredFilingDocument } from "../../lib/knowledge-factory/types";
import { hashBytes } from "../../lib/knowledge-factory/pipeline/text";

function discovered(sourceId: string, title: string): DiscoveredFilingDocument {
  return {
    sourceId,
    filing: {
      accessionNumber: "0000000000-00-000001",
      formType: "8-K",
      filingDate: "2024-01-01",
      issuer: { cik: "0000123456", ticker: "TEST" },
    },
    exhibit: {
      filename: "ex101.htm",
      description: title,
      exhibitType: "EX-10.1",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/123456/000/ex101.htm",
    },
    discoverySignals: ["test"],
  };
}

describe("second-run dedupe", () => {
  let store: CorpusStore;

  beforeEach(() => {
    const root = mkdtempSync(path.join(tmpdir(), "kf-dedupe-"));
    store = new CorpusStore({
      root,
      bytes: path.join(root, "bytes"),
      manifests: path.join(root, "manifests"),
      checkpoints: path.join(root, "checkpoints"),
      cache: path.join(root, "cache"),
    });
  });

  it("does not duplicate records when the same bytes are ingested under a second sourceId", async () => {
    const text = `
      ARTICLE VI NEGATIVE COVENANTS
      Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness except as permitted.
      Section 6.02 Liens. provided that no Default has occurred.
      "EBITDA" means Consolidated Net Income plus interest.
    `;
    const bytes = Buffer.from(text, "utf8");
    const contentHash = hashBytes(bytes);

    const first = await processAcquiredDocument(store, {
      discovered: discovered("edgar:acc:ex101.htm", "Credit Agreement"),
      bytes,
      contentHash,
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });
    expect(first.wasDuplicate).toBe(false);
    expect(store.listSources()).toHaveLength(1);

    const second = await processAcquiredDocument(store, {
      discovered: discovered("edgar:acc:ex101-alias.htm", "Credit Agreement (refiled)"),
      bytes,
      contentHash,
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });
    expect(second.wasDuplicate).toBe(true);
    expect(store.listSources()).toHaveLength(1);
    expect(store.getSource("edgar:acc:ex101-alias.htm")).toBeNull();
    expect(second.source.sourceId).toBe("edgar:acc:ex101.htm");

    const aliases = store.readJson<Record<string, string[]>>("dedupe-aliases.json");
    expect(aliases?.["edgar:acc:ex101.htm"]).toContain("edgar:acc:ex101-alias.htm");
  });
});
