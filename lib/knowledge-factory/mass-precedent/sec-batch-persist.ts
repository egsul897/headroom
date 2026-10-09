/**
 * Fetch remaining acquisition-manifest financing exhibits from SEC and persist to Neon BYTEA.
 * Idempotent. Respects rate limits via SecHttpClient. Does not invent bytes.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EdgarKnowledgeClient } from "../edgar/client";
import { hashBytes } from "../pipeline/text";
import { processAcquiredDocument } from "../pipeline/run";
import { persistDurableKnowledgeSource } from "../preservation/durable-store";
import type { AcquisitionManifest } from "../preservation/acquisition-manifest";
import type { DiscoveredFilingDocument, KnowledgeSourceRecord } from "../types";
import { prisma } from "../../prisma";
import { openMassPrecedentCorpus } from "./corpus-paths";
import { writePrecedentRetrievalIndex } from "./retrieval-index";
import { buildDocumentCovenantSummary } from "../../product/covenant-intelligence/summarize";
import { assertLiveWriteApproval, type LiveWriteApprovalRecord } from "../live-write-approval";
import { decideCorpusAcceptance, type CorpusAcceptance } from "./corpus-acceptance";

export const MASS_LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
export const MASS_LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";
export const CONSOL_LIVE_ENV = "KF_CONSOLIDATION_LIVE_WRITE";
export const CONSOL_LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";

function liveAuthorized(): boolean {
  return (
    process.env[MASS_LIVE_ENV] === MASS_LIVE_TOKEN ||
    process.env[CONSOL_LIVE_ENV] === CONSOL_LIVE_TOKEN
  );
}

export interface SecBatchPersistResult {
  attempted: number;
  fetched: number;
  persisted: number;
  reused: number;
  analyzed: number;
  skippedAlreadyPersisted: number;
  skippedFalsePositive: number;
  hashMismatchesRecorded: number;
  rejectedBlockedOrTiny: number;
  /** Persisted (bytes preserved) but excluded from financing-precedent acceptance: unrelated exhibits, unknown class without financing cues. */
  quarantinedNonFinancing: number;
  /** Fetched bytes whose hash differs from the manifest's; source-byte identity across acquisitions is UNRECONCILED, not corrupt and not confirmed. */
  sourceIdentityUnreconciled: number;
  errors: Array<{ sourceId: string; error: string }>;
  /** Every persisted source id, financing or quarantined. */
  persistedSourceIds: string[];
  /** The subset whose substantive relevance as a financing precedent is established. */
  financingPrecedentSourceIds: string[];
  quarantinedSourceIds: string[];
  /** The approval record a live run was executed under (null for dry runs). */
  approval: { ref: string; approvedBy: string; approvedAt: string; environment: string; scope: string } | null;
}

/** Reject SEC fair-access blocks and empty/error bodies — accept real exhibit HTML even if manifest hash drifts. */
function looksLikeAuthenticExhibit(bytes: Buffer): boolean {
  if (bytes.length < 8_000) return false;
  const head = bytes.slice(0, 4_000).toString("utf8").toLowerCase();
  if (head.includes("undeclared automated tool")) return false;
  if (head.includes("your request has been denied")) return false;
  if (head.includes("access denied")) return false;
  return head.includes("<html") || head.includes("<!doctype") || head.includes("<document");
}

export async function persistSecManifestBatch(params?: {
  repoRoot?: string;
  limit?: number;
  checkpointEvery?: number;
  live?: boolean;
}): Promise<SecBatchPersistResult> {
  const repoRoot = params?.repoRoot ?? process.cwd();
  const live = Boolean(params?.live);
  if (live && !liveAuthorized()) {
    throw new Error(
      `Live SEC persist refused: set ${MASS_LIVE_ENV}=${MASS_LIVE_TOKEN} after owner approval`,
    );
  }
  // The token is intent; the committed approval record is authority. Both, or no live write.
  const approval: LiveWriteApprovalRecord | null = live ? assertLiveWriteApproval({ operation: "mass-precedent-sec-batch", repoRoot }) : null;

  process.env.HEADROOM_SEC_FETCH_OWNER = process.env.HEADROOM_SEC_FETCH_OWNER || "WS-CKF";

  const manifestPath = path.join(
    repoRoot,
    "docs/knowledge-factory/preservation/acquisition-manifest.json",
  );
  if (!existsSync(manifestPath)) throw new Error(`Missing manifest: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AcquisitionManifest;

  const existing = await prisma.knowledgeSource.findMany({
    where: { storageRef: { not: null } },
    select: { sourceId: true, originalBytesHash: true },
  });
  const existingIds = new Set(existing.map((e) => e.sourceId));
  const existingHashes = new Set(existing.map((e) => e.originalBytesHash));

  const store = openMassPrecedentCorpus(repoRoot);
  const client = new EdgarKnowledgeClient({
    cacheDir: path.join(store.paths.cache, "sec"),
    logDir: path.join(store.paths.root, "logs"),
  });

  const out: SecBatchPersistResult = {
    attempted: 0,
    fetched: 0,
    persisted: 0,
    reused: 0,
    analyzed: 0,
    skippedAlreadyPersisted: 0,
    skippedFalsePositive: 0,
    hashMismatchesRecorded: 0,
    rejectedBlockedOrTiny: 0,
    quarantinedNonFinancing: 0,
    sourceIdentityUnreconciled: 0,
    errors: [],
    persistedSourceIds: [],
    financingPrecedentSourceIds: [],
    quarantinedSourceIds: [],
    approval: approval ? { ref: approval.ref, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, environment: approval.environment, scope: approval.scope } : null,
  };

  const financing = manifest.locators.filter((l) => l.corpusRole !== "FALSE_POSITIVE_EXHIBIT");
  // Manifest locators already marked FALSE_POSITIVE_EXHIBIT are excluded up front; count them so the
  // metric is not a constant zero.
  out.skippedFalsePositive = manifest.locators.length - financing.length;
  const pending = financing.filter((l) => !existingIds.has(l.sourceId));
  const batch = pending.slice(0, params?.limit ?? 71);
  const checkpointEvery = params?.checkpointEvery ?? 25;
  const checkpointDir = path.join(repoRoot, "docs/knowledge-factory/mass-precedent");
  mkdirSync(checkpointDir, { recursive: true });

  for (const loc of batch) {
    out.attempted += 1;
    if (loc.corpusRole === "FALSE_POSITIVE_EXHIBIT") {
      out.skippedFalsePositive += 1;
      continue;
    }
    if (existingIds.has(loc.sourceId) || (loc.rawContentSha256 && existingHashes.has(loc.rawContentSha256))) {
      out.skippedAlreadyPersisted += 1;
      continue;
    }

    const discovered: DiscoveredFilingDocument = {
      sourceId: loc.sourceId,
      filing: {
        accessionNumber: loc.accessionNumber,
        formType: "8-K",
        filingDate: (loc.acquisitionTimestamp ?? new Date().toISOString()).slice(0, 10),
        issuer: { cik: loc.cik },
      },
      exhibit: {
        filename: loc.exhibitFilename,
        description: loc.exhibitFilename,
        exhibitType: "EX-10",
        sourceUrl: loc.archivesUrl ?? loc.sourceUrl,
      },
      discoverySignals: ["mass-precedent-sec-batch"],
    };

    try {
      const { bytes, contentHash } = await client.fetchDocument(discovered);
      out.fetched += 1;
      const actual = hashBytes(bytes);
      if (!looksLikeAuthenticExhibit(bytes)) {
        out.rejectedBlockedOrTiny += 1;
        out.errors.push({
          sourceId: loc.sourceId,
          error: `rejected non-exhibit body bytes=${bytes.length} hash=${actual}`,
        });
        continue;
      }
      const manifestHash = loc.rawContentSha256;
      const hashDrift =
        Boolean(manifestHash) && actual !== manifestHash && contentHash !== manifestHash;
      if (hashDrift) {
        out.hashMismatchesRecorded += 1;
        out.sourceIdentityUnreconciled += 1;
      }

      const source: KnowledgeSourceRecord = {
        sourceId: loc.sourceId,
        issuerCik: loc.cik.padStart(10, "0"),
        accessionNumber: loc.accessionNumber,
        exhibitFilename: loc.exhibitFilename,
        sourceUrl: loc.archivesUrl ?? loc.sourceUrl,
        filingDate: discovered.filing.filingDate,
        formType: discovered.filing.formType,
        documentTitle: loc.exhibitFilename,
        documentClass: "UNKNOWN",
        // Persist the bytes actually retrieved; record manifest drift in metadata.
        originalBytesHash: actual,
        acquisitionTimestamp: new Date().toISOString(),
        parserVersion: "mass-precedent-sec-batch.v1",
        extractionStatus: "ACQUIRED",
        representationLevel: "SOURCE_ONLY",
        provenance: loc.provenance ?? "sec-edgar-manifest",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
        byteSize: bytes.length,
      };

      if (live) {
        const persist = await persistDurableKnowledgeSource({ source, bytes, contentType: "text/html" });
        if (persist.reusedExisting) out.reused += 1;
        else out.persisted += 1;
        out.persistedSourceIds.push(loc.sourceId);
        existingIds.add(loc.sourceId);
        existingHashes.add(actual);
      }

      const processed = await processAcquiredDocument(store, {
        discovered,
        bytes,
        contentHash: actual,
        provenance: source.provenance,
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      });
      out.analyzed += 1;

      // Substantive acceptance: bytes are preserved either way; only documents whose class or title
      // establishes a financing instrument count as financing precedents. Everything else is
      // quarantined (kept for audit, excluded from precedent counts and retrieval).
      const acceptance: CorpusAcceptance = decideCorpusAcceptance({
        source: { ...processed.source, byteSize: bytes.length },
        manifestHash: manifestHash ?? null,
        fetchedHash: actual,
        clientHash: contentHash,
        bodyHeadSample: bytes.subarray(0, 120_000).toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
      });
      if (acceptance.corpusRole === "QUARANTINED_NON_FINANCING") {
        out.quarantinedNonFinancing += 1;
        if (live) out.quarantinedSourceIds.push(loc.sourceId);
      } else if (live) {
        out.financingPrecedentSourceIds.push(loc.sourceId);
      }

      const summary = buildDocumentCovenantSummary({
        sourceId: loc.sourceId,
        documentTitle: processed.source.documentTitle,
        issuerName: processed.source.issuerName,
        issuerCik: processed.source.issuerCik,
        documentClass: processed.source.documentClass,
        candidates: store.loadCandidates(loc.sourceId),
        definitions: store.loadDefinitions(loc.sourceId),
        structuralNodes: store.loadStructuralNodes(loc.sourceId),
      });

      if (live) {
        const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: loc.sourceId } });
        if (row) {
          const prev =
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? (row.metadata as Record<string, unknown>)
              : {};
          await prisma.knowledgeSource.update({
            where: { sourceId: loc.sourceId },
            data: {
              documentTitle: processed.source.documentTitle,
              documentClass: processed.source.documentClass as never,
              extractionStatus: processed.source.extractionStatus as never,
              representationLevel: processed.source.representationLevel as never,
              issuerName: processed.source.issuerName,
              issuerTicker: processed.source.issuerTicker,
              metadata: JSON.parse(
                JSON.stringify({
                  ...prev,
                  manifestRawContentSha256: manifestHash ?? null,
                  contentHashDriftFromManifest: hashDrift,
                  sourceByteIdentity: acceptance.sourceByteIdentity,
                  corpusRole: acceptance.corpusRole,
                  corpusRoleReason: acceptance.reason,
                  liveWriteApprovalRef: approval?.ref ?? null,
                  analysis: {
                    structuralNodes: processed.structuralNodeCount,
                    definitions: processed.definitionCount,
                    covenantCandidates: processed.candidateCount,
                    crossReferences: processed.crossReferenceCount,
                    processingMs: processed.processingMs,
                  },
                  covenantSummary: summary,
                  promotedToLegalTruth: 0,
                }),
              ),
            },
          });
        }
      }
    } catch (err) {
      out.errors.push({
        sourceId: loc.sourceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (out.attempted % checkpointEvery === 0) {
      writeFileSync(
        path.join(checkpointDir, "sec-batch-checkpoint.json"),
        JSON.stringify({ at: new Date().toISOString(), ...out }, null, 2) + "\n",
      );
    }
  }

  writePrecedentRetrievalIndex(store, path.join(checkpointDir, "retrieval-index.json"));
  writeFileSync(
    path.join(checkpointDir, "sec-batch-result.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), live, ...out }, null, 2) + "\n",
  );
  return out;
}
