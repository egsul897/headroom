import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { hashBytes } from "../../lib/knowledge-factory/pipeline/text";
import { probeDurability } from "../../lib/knowledge-factory/preservation/durability";
import { buildSourceInventory } from "../../lib/knowledge-factory/preservation/inventory";
import { buildAcquisitionManifest } from "../../lib/knowledge-factory/preservation/acquisition-manifest";
import { buildCanonicalConsumerExport, writeCanonicalExport } from "../../lib/knowledge-factory/export/build-canonical-export";
import { runDefinitionEncyclopediaImport } from "../../lib/knowledge-factory/consumers/definition-encyclopedia-import";
import { runDependencyAtlasImport } from "../../lib/knowledge-factory/consumers/dependency-atlas-import";
import { measureReplayCounts } from "../../lib/knowledge-factory/preservation/replay";
import type { DiscoveredFilingDocument } from "../../lib/knowledge-factory/types";

function discovered(sourceId: string, title: string): DiscoveredFilingDocument {
  return {
    sourceId,
    filing: {
      accessionNumber: "0000000000-00-000099",
      formType: "8-K",
      filingDate: "2024-06-01",
      issuer: { cik: "0000999999", ticker: "PH3", name: "Phase Three Test Co" },
    },
    exhibit: {
      filename: "ex101-credit.htm",
      description: title,
      exhibitType: "EX-10.1",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/999999/000000000000000099/ex101-credit.htm",
    },
    discoverySignals: ["phase3-test"],
  };
}

describe("phase3 preservation + consumer contract", () => {
  let store: CorpusStore;

  beforeEach(async () => {
    const root = mkdtempSync(path.join(tmpdir(), "kf-phase3-"));
    store = new CorpusStore({
      root,
      bytes: path.join(root, "bytes"),
      manifests: path.join(root, "manifests"),
      checkpoints: path.join(root, "checkpoints"),
      cache: path.join(root, "cache"),
    });
    const text = `
      CREDIT AGREEMENT
      ARTICLE I DEFINITIONS
      "EBITDA" means Consolidated Net Income plus Interest Expense.
      ARTICLE VI NEGATIVE COVENANTS
      Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness except as permitted under Section 6.01(b).
      Section 6.02 Liens. The Borrower shall not create Liens provided that no Default has occurred.
    `;
    const bytes = Buffer.from(text, "utf8");
    await processAcquiredDocument(store, {
      discovered: discovered("edgar:0000000000-00-000099:ex101-credit.htm", "Credit Agreement"),
      bytes,
      contentHash: hashBytes(bytes),
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });
  });

  it("probes durability honestly when credentials are absent", () => {
    const probe = probeDurability({} as NodeJS.ProcessEnv);
    expect(probe.durable).toBe(false);
    expect(probe.mode).toBe("LOCAL_ONLY_NOT_CROSS_VM_DURABLE");
    expect(probe.missingPrerequisites.length).toBeGreaterThan(0);
  });

  it("inventories source with hashes, versions, aliases, and byte location", () => {
    const inv = buildSourceInventory(store);
    expect(inv.durabilityClaim).toBe("NONE");
    expect(inv.sources).toHaveLength(1);
    const s = inv.sources[0]!;
    expect(s.rawContentSha256).toHaveLength(64);
    expect(s.accessionNumber).toBe("0000000000-00-000099");
    expect(s.exhibitFilename).toBe("ex101-credit.htm");
    expect(s.originalSourceUrl).toContain("sec.gov");
    expect(s.extractionVersion).toBeTruthy();
    expect(s.structuralParserVersion).toBeTruthy();
    expect(s.sourceByteLocation.bytesPresent).toBe(true);
    expect(s.deduplicationIdentity).toBe(s.rawContentSha256);
    expect(s.artifactDigests.structuralNodeCount).toBeGreaterThan(0);
  });

  it("builds acquisition manifest with SEC locators and recovery procedure", () => {
    const durability = probeDurability({} as NodeJS.ProcessEnv);
    const man = buildAcquisitionManifest(store, durability);
    expect(man.durabilityClaim).toBe("NONE");
    expect(man.locators).toHaveLength(1);
    expect(man.locators[0]!.archivesUrl).toContain("/Archives/edgar/data/");
    expect(man.locators[0]!.rawContentSha256).toHaveLength(64);
    expect(man.recoveryProcedure.script).toContain("recover-from-manifest.ts");
    expect(man.contentDigest).toHaveLength(64);
  });

  it("exports canonical consumer package and validates two independent imports", () => {
    const exportDoc = buildCanonicalConsumerExport(store, { compact: true, durabilityClaim: "NONE" });
    expect(exportDoc.schemaVersion).toBe("knowledge-factory.consumer-export.v1");
    expect(exportDoc.safety.automaticLegalVerification).toBe(false);
    expect(exportDoc.safety.automaticCapacityPromotion).toBe(false);
    expect(exportDoc.counts.sources).toBe(1);
    expect(exportDoc.definitions.length).toBeGreaterThan(0);
    expect(exportDoc.dependencyEdges.length).toBeGreaterThan(0);

    const encyclopedia = runDefinitionEncyclopediaImport(exportDoc);
    const atlas = runDependencyAtlasImport(exportDoc);

    expect(encyclopedia.pass1.ok).toBe(true);
    expect(encyclopedia.pass2.idempotent).toBe(true);
    expect(encyclopedia.pass1.promotedToLegalTruth).toBe(0);
    expect(atlas.pass1.ok).toBe(true);
    expect(atlas.pass2.idempotent).toBe(true);
    expect(atlas.pass1.promotedToLegalTruth).toBe(0);
    expect(atlas.sharedSourceIdsWithPeer(encyclopedia.pass1.canonicalSourceIds)).toBe(true);

    const out = mkdtempSync(path.join(tmpdir(), "kf-export-"));
    const written = writeCanonicalExport(exportDoc, out, { writeFullEnvelope: true });
    expect(existsSync(written.manifestPath)).toBe(true);
    expect(existsSync(written.shardPaths.definitions!)).toBe(true);
    const defs = JSON.parse(readFileSync(written.shardPaths.definitions!, "utf8")) as unknown[];
    expect(defs.length).toBe(exportDoc.definitions.length);
  });

  it("does not create a new canonical record on duplicate-byte reingestion", async () => {
    const src = store.listSources()[0]!;
    const bytes = store.readBytes(src.originalBytesHash)!;
    const before = store.listSources().length;
    const result = await processAcquiredDocument(store, {
      discovered: discovered("edgar:0000000000-00-000099:ex101-credit.htm__dup", "Credit Agreement"),
      bytes,
      contentHash: src.originalBytesHash,
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });
    expect(result.wasDuplicate).toBe(true);
    expect(store.listSources()).toHaveLength(before);
    expect(store.getSource("edgar:0000000000-00-000099:ex101-credit.htm__dup")).toBeNull();
    const counts = measureReplayCounts(store);
    expect(counts.acquiredFinancingDocuments).toBe(1);
  });
});

describe("committed phase3 export artifacts (when present)", () => {
  const contractPath = path.resolve("docs/knowledge-factory/export/v1/consumer-contract.json");

  it("consumer-contract identity is stable and points at shards", () => {
    if (!existsSync(contractPath)) return;
    const contract = JSON.parse(readFileSync(contractPath, "utf8")) as {
      schemaVersion: string;
      sourceVersionId: string;
      durabilityClaim: string;
      shards: Record<string, string>;
      counts: { financingDocuments: number };
    };
    expect(contract.schemaVersion).toBe("knowledge-factory.consumer-export.v1");
    expect(contract.durabilityClaim).toBe("NONE");
    expect(contract.sourceVersionId.startsWith("srcver:")).toBe(true);
    expect(contract.shards.sources).toBe("sources.json");
    expect(contract.counts.financingDocuments).toBe(113);
  });
});
