/**
 * Manual-upload convergence (docs/autonomous-retrieval-phase-a-foundation.md,
 * task §2 "do not create separate uploaded-company and connected-company
 * architectures").
 *
 * Two things live here:
 *
 * 1. `UploadConnector` - a SourceConnector implementation for
 *    ConnectorType.DOCUMENT_UPLOAD, for structural/interface uniformity with
 *    EdgarConnector/CsvFinancialConnector (lib/connectors/registry.ts's
 *    getConnectorForConnection can construct one for any DOCUMENT_UPLOAD
 *    connection). Like CsvFinancialConnector it is PUSH-based - there is
 *    nothing to poll, only bytes a human is uploading right now - so
 *    discover()/fetch() operate on bytes provided at construction time.
 *
 * 2. `uploadDocumentThroughIngestion` - the actual integration point the
 *    existing upload UI/action calls. Deliberately does NOT reimplement
 *    lib/onboarding/documents.ts's `uploadAndChunkDocument` (storage -> parse
 *    -> chunk -> Document row) - that logic is untouched. This function adds
 *    exactly the ONE new step the brief requires: check the
 *    (companyId, contentHash) dedup constraint BEFORE calling
 *    uploadAndChunkDocument, and create the SourceArtifact row linking to the
 *    Document row it produces - so a manual upload is a first-class source
 *    connection like any other, not a special case.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { getDocumentStorageProvider } from "../document-storage";
import { uploadAndChunkDocument, type UploadDocumentParams } from "../onboarding/documents";
import { computeContentHash, findDuplicateArtifact } from "./dedup";
import { getOrCreateUploadConnection } from "./registry";
import type { ConnectorCapability, ConnectorHealth, DiscoverOptions, DiscoveredSourceItem, RawSourceArtifact, SourceConnector, SourceDelta } from "./types";

export interface UploadConnectorConfig {
  filename: string;
  data?: Buffer;
  contentType?: string;
}

export class UploadConnector implements SourceConnector {
  private readonly filename: string;
  private readonly data?: Buffer;

  constructor(config: UploadConnectorConfig) {
    this.filename = config.filename;
    this.data = config.data;
  }

  capabilities(): ConnectorCapability[] {
    return ["DOCUMENTS"];
  }

  async discover(options: DiscoverOptions): Promise<DiscoveredSourceItem[]> {
    const bytes = options.rawInput ?? this.data;
    if (!bytes) {
      throw new Error("UploadConnector.discover: no file bytes available - pass data at construction or rawInput via DiscoverOptions.");
    }
    return [
      {
        id: this.filename,
        artifactType: "DOCUMENT",
        sourceIdentifier: this.filename,
        summary: `Uploaded file: ${this.filename}`,
      },
    ];
  }

  async fetch(item: DiscoveredSourceItem): Promise<RawSourceArtifact> {
    if (!this.data) {
      throw new Error(`UploadConnector.fetch: no bytes held for ${item.id} - construct with data.`);
    }
    return { item, data: this.data, contentHash: computeContentHash(this.data), mimeType: undefined };
  }

  /** A single upload is not a pollable feed - see CsvFinancialConnector's identical rationale. */
  async syncSince(_cursor: string | null): Promise<SourceDelta[]> {
    const items = await this.discover({});
    return items.map((item) => ({ changeType: "NEW" as const, item }));
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return { ok: true };
  }
}

export interface UploadThroughIngestionResult {
  duplicate: boolean;
  document?: Awaited<ReturnType<typeof uploadAndChunkDocument>>["document"];
  chunkCount?: number;
  artifactId: string;
}

/**
 * The real integration point: server-side only (same discipline
 * uploadAndChunkDocument itself already documents - storageRef must never
 * reach a client bundle). Computes the dedup hash BEFORE touching storage or
 * the database; on a hit, returns { duplicate: true } and the EXISTING
 * artifact's id WITHOUT calling uploadAndChunkDocument at all (no duplicate
 * Document row, no duplicate blob write) - on a miss, uploads as normal and
 * creates the linking SourceArtifact row.
 *
 * Concurrency: the findDuplicateArtifact check above and the
 * prisma.sourceArtifact.create below are two separate round-trips, so two
 * near-simultaneous callers for the SAME (companyId, contentHash) can both
 * pass the check and both proceed to call uploadAndChunkDocument - each
 * creating its own real Document row before either writes the SourceArtifact
 * row that the @@unique([companyId, contentHash]) constraint actually
 * serializes on. The loser's `create` throws Postgres's own real P2002
 * unique-violation; rather than let that raw DB error surface to the caller
 * (and leave behind an orphaned Document + blob nothing ever links to), the
 * loser unwinds its own just-created Document/blob and converges on the
 * winner's artifact, exactly as if it had lost the race at the first check.
 */
export async function uploadDocumentThroughIngestion(params: UploadDocumentParams): Promise<UploadThroughIngestionResult> {
  const contentHash = computeContentHash(params.data);
  const existing = await findDuplicateArtifact(params.companyId, contentHash);
  if (existing) {
    return { duplicate: true, artifactId: existing.id };
  }

  const uploadConnection = await getOrCreateUploadConnection(params.companyId);
  const { document, chunkCount } = await uploadAndChunkDocument(params);

  try {
    const artifact = await prisma.sourceArtifact.create({
      data: {
        companyId: params.companyId,
        sourceConnectionId: uploadConnection.id,
        artifactType: "DOCUMENT",
        sourceIdentifier: params.filename,
        retrievedAt: new Date(),
        contentHash,
        storageRef: document.storageRef,
        documentId: document.id,
      },
    });
    return { duplicate: false, document, chunkCount, artifactId: artifact.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await unwindLosingUpload(document);
      const winner = await findDuplicateArtifact(params.companyId, contentHash);
      if (winner) {
        return { duplicate: true, artifactId: winner.id };
      }
    }
    throw err;
  }
}

/**
 * Unwinds a Document row (and its stored blob) created by a caller that lost
 * the concurrent-duplicate race above. Safe to do unconditionally: at this
 * point in the function nothing else in the system has had a chance to
 * reference this Document row yet (its own SourceArtifact row is exactly
 * the create that just failed, and no ExtractionRun/chunk-review step runs
 * until a later, separate action) - DocumentChunk rows cascade-delete with
 * it (schema: `onDelete: Cascade`). Best-effort in the same spirit as
 * uploadAndChunkDocument's own orphan-blob cleanup: never let a cleanup
 * failure mask the real outcome (convergence on the winner's artifact).
 */
async function unwindLosingUpload(document: Awaited<ReturnType<typeof uploadAndChunkDocument>>["document"]): Promise<void> {
  const storage = getDocumentStorageProvider();
  if (document.storageRef) {
    await storage.delete(document.storageRef).catch(() => {});
  }
  await prisma.document.delete({ where: { id: document.id } }).catch(() => {});
}
