import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentAddress } from "../compiler/inference/hash";
import { assertNotAutoVerified, COVENANT_KNOWLEDGE_SCHEMA_VERSION, KnowledgeRecordSchema, type KnowledgeRecord } from "./schema";

export interface CovenantKnowledgeStoreOptions {
  rootDir: string;
}

/**
 * File-backed content-addressed covenant knowledge store.
 * Bulk data stays out of Git (covenant-knowledge-data/ is gitignored).
 */
export class CovenantKnowledgeStore {
  readonly rootDir: string;
  private readonly objectsDir: string;
  private readonly indexPath: string;

  constructor(options: CovenantKnowledgeStoreOptions) {
    this.rootDir = options.rootDir;
    this.objectsDir = join(this.rootDir, "objects");
    this.indexPath = join(this.rootDir, "index.json");
    mkdirSync(this.objectsDir, { recursive: true });
    if (!existsSync(this.indexPath)) writeFileSync(this.indexPath, JSON.stringify({ schemaVersion: COVENANT_KNOWLEDGE_SCHEMA_VERSION, records: {} }, null, 2));
  }

  private loadIndex(): { schemaVersion: string; records: Record<string, { contentHash: string; kind: string; path: string }> } {
    return JSON.parse(readFileSync(this.indexPath, "utf8"));
  }

  private saveIndex(index: { schemaVersion: string; records: Record<string, { contentHash: string; kind: string; path: string }> }): void {
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
  }

  put(partial: {
    recordId: string;
    kind: KnowledgeRecord["kind"];
    body: Record<string, unknown>;
    contentHash?: string;
    duplicateGroupId?: string | null;
    companyId?: string | null;
    packageKey?: string | null;
    instrumentKey?: string | null;
    documentId?: string | null;
    candidateRef?: string | null;
    verificationStatus?: KnowledgeRecord["verificationStatus"];
    modelGenerated?: boolean;
    uncertainty?: string[];
    dependencies?: string[];
    invalidatedBy?: string | null;
    reviewerDecision?: KnowledgeRecord["reviewerDecision"];
    provenance?: Partial<KnowledgeRecord["provenance"]>;
  }): KnowledgeRecord {
    const bodyHash = contentAddress(partial.body);
    const record: KnowledgeRecord = KnowledgeRecordSchema.parse({
      recordId: partial.recordId,
      kind: partial.kind,
      body: partial.body,
      duplicateGroupId: partial.duplicateGroupId ?? null,
      companyId: partial.companyId ?? null,
      packageKey: partial.packageKey ?? null,
      instrumentKey: partial.instrumentKey ?? null,
      documentId: partial.documentId ?? null,
      candidateRef: partial.candidateRef ?? null,
      verificationStatus: partial.verificationStatus ?? "UNVERIFIED",
      modelGenerated: partial.modelGenerated ?? false,
      uncertainty: partial.uncertainty ?? [],
      dependencies: partial.dependencies ?? [],
      invalidatedBy: partial.invalidatedBy ?? null,
      reviewerDecision: partial.reviewerDecision ?? null,
      schemaVersion: COVENANT_KNOWLEDGE_SCHEMA_VERSION,
      contentHash: partial.contentHash ?? bodyHash,
      provenance: {
        sourceSpans: partial.provenance?.sourceSpans ?? [],
        compilerVersion: partial.provenance?.compilerVersion ?? null,
        inferenceMode: partial.provenance?.inferenceMode ?? null,
        contextHash: partial.provenance?.contextHash ?? null,
        createdAt: partial.provenance?.createdAt ?? new Date().toISOString(),
      },
    });
    assertNotAutoVerified(record);
    const path = join(this.objectsDir, `${record.contentHash}.json`);
    writeFileSync(path, JSON.stringify(record, null, 2));
    const index = this.loadIndex();
    index.records[record.recordId] = { contentHash: record.contentHash, kind: record.kind, path };
    this.saveIndex(index);
    return record;
  }

  get(recordId: string): KnowledgeRecord | null {
    const index = this.loadIndex();
    const entry = index.records[recordId];
    if (!entry) return null;
    return KnowledgeRecordSchema.parse(JSON.parse(readFileSync(entry.path, "utf8")));
  }

  getByContentHash(hash: string): KnowledgeRecord | null {
    const path = join(this.objectsDir, `${hash}.json`);
    if (!existsSync(path)) return null;
    return KnowledgeRecordSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  }

  list(filter?: { kind?: KnowledgeRecord["kind"]; documentId?: string | null }): KnowledgeRecord[] {
    const index = this.loadIndex();
    const out: KnowledgeRecord[] = [];
    for (const id of Object.keys(index.records)) {
      const rec = this.get(id);
      if (!rec) continue;
      if (filter?.kind && rec.kind !== filter.kind) continue;
      if (filter?.documentId !== undefined && rec.documentId !== filter.documentId) continue;
      out.push(rec);
    }
    return out;
  }

  /** Storage usage in bytes (objects only). */
  storageBytes(): number {
    if (!existsSync(this.objectsDir)) return 0;
    let total = 0;
    for (const f of readdirSync(this.objectsDir)) {
      total += readFileSync(join(this.objectsDir, f)).byteLength;
    }
    return total;
  }
}
