/**
 * Reproducible acquisition manifest with exact SEC source locators and hashes.
 * Used when shared durable storage is unavailable.
 */

import { createHash } from "node:crypto";
import { KNOWLEDGE_FACTORY_VERSION } from "../types";
import { STRUCTURAL_INDEX_VERSION } from "../../contract-model/compiler/types";
import type { CorpusStore } from "../store/corpus-store";
import type { DurabilityProbeResult } from "./durability";
import { buildSourceInventory, type SourceInventoryEntry } from "./inventory";

export const ACQUISITION_MANIFEST_SCHEMA_VERSION = "knowledge-factory.acquisition-manifest.v1";

export interface AcquisitionLocator {
  sourceId: string;
  accessionNumber: string;
  exhibitFilename: string;
  cik: string;
  sourceUrl: string;
  /** Prefer Archives path when reconstructible from accession + CIK + filename. */
  archivesUrl: string | null;
  rawContentSha256: string;
  byteSize?: number;
  acquisitionTimestamp: string;
  provenance: string;
  instrumentIdentity?: string;
  corpusRole: SourceInventoryEntry["corpusRole"];
}

export interface AcquisitionManifest {
  schemaVersion: typeof ACQUISITION_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  knowledgeFactoryVersion: string;
  structuralParserVersion: string;
  durability: DurabilityProbeResult;
  durabilityClaim: "NONE";
  recoveryProcedure: {
    script: string;
    steps: string[];
    fairAccess: string;
  };
  contentDigest: string;
  financingDocumentCount: number;
  fixtureDocumentCount: number;
  locators: AcquisitionLocator[];
}

function archivesUrlFrom(entry: SourceInventoryEntry): string | null {
  const cikNum = entry.issuerCik.replace(/^0+/, "") || "0";
  const accCompact = entry.accessionNumber.replace(/-/g, "");
  if (!entry.accessionNumber || !entry.exhibitFilename) return null;
  if (entry.originalSourceUrl.includes("/Archives/edgar/data/")) {
    const m = entry.originalSourceUrl.match(
      /https?:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/[^?\s]+/i,
    );
    if (m) return m[0];
  }
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accCompact}/${entry.exhibitFilename}`;
}

export function buildAcquisitionManifest(
  store: CorpusStore,
  durability: DurabilityProbeResult,
): AcquisitionManifest {
  const inventory = buildSourceInventory(store);
  const locators: AcquisitionLocator[] = inventory.sources
    .filter((s) => s.corpusRole === "FINANCING" || s.corpusRole === "FALSE_POSITIVE_EXHIBIT")
    .map((s) => ({
      sourceId: s.sourceId,
      accessionNumber: s.accessionNumber,
      exhibitFilename: s.exhibitFilename,
      cik: s.issuerCik,
      sourceUrl: s.originalSourceUrl,
      archivesUrl: archivesUrlFrom(s),
      rawContentSha256: s.rawContentSha256,
      byteSize: s.sourceByteLocation.byteSize,
      acquisitionTimestamp: s.acquisitionTimestamp,
      provenance: s.provenance,
      instrumentIdentity: s.instrumentIdentity,
      corpusRole: s.corpusRole,
    }));

  const contentDigest = createHash("sha256")
    .update(
      locators
        .map((l) => `${l.sourceId}|${l.rawContentSha256}|${l.archivesUrl ?? l.sourceUrl}`)
        .sort()
        .join("\n"),
    )
    .digest("hex");

  return {
    schemaVersion: ACQUISITION_MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    knowledgeFactoryVersion: KNOWLEDGE_FACTORY_VERSION,
    structuralParserVersion: STRUCTURAL_INDEX_VERSION,
    durability,
    durabilityClaim: "NONE",
    recoveryProcedure: {
      script: "scripts/knowledge-factory/recover-from-manifest.ts",
      steps: [
        "Load docs/knowledge-factory/preservation/acquisition-manifest.json",
        "For each locator, fetch archivesUrl (or sourceUrl) via EdgarKnowledgeClient with HEADROOM_SEC_FETCH_OWNER=WS-CKF",
        "Verify SHA-256 of downloaded bytes against rawContentSha256",
        "Upsert via processAcquiredDocument (exact-byte dedupe; no new canonical sourceId on hash hit)",
        "Re-run finalizeCorpusIndex / phase3 export to regenerate structural slices from parser versions recorded here",
      ],
      fairAccess:
        "Use identifying User-Agent, ≤10 req/s shared budget, cache, retries. Coordinate with WS-EHB when HEADROOM_SEC_FETCH_OWNER is contended.",
    },
    contentDigest,
    financingDocumentCount: inventory.counts.financingDocuments,
    fixtureDocumentCount: inventory.counts.fixtureDocuments,
    locators,
  };
}
