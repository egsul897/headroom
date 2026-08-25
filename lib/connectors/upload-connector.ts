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

import { prisma } from "../prisma";
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
 */
export async function uploadDocumentThroughIngestion(params: UploadDocumentParams): Promise<UploadThroughIngestionResult> {
  const contentHash = computeContentHash(params.data);
  const existing = await findDuplicateArtifact(params.companyId, contentHash);
  if (existing) {
    return { duplicate: true, artifactId: existing.id };
  }

  const uploadConnection = await getOrCreateUploadConnection(params.companyId);
  const { document, chunkCount } = await uploadAndChunkDocument(params);

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
}
