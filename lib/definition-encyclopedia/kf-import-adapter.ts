/**
 * Knowledge Factory import adapter (WS-DEF → WS-CKF compatible records).
 *
 * Consumes the encyclopedia export and emits CKF-shaped DefinitionRecord /
 * source provenance envelopes WITHOUT modifying CKF schemas, Prisma models,
 * or migrations. Idempotent: stable identities from content hashes.
 *
 * CKF draft types observed on branch cursor/covenant-knowledge-factory-7327
 * (`lib/knowledge-factory/types.ts` DefinitionRecord). This adapter mirrors
 * that shape as a local structural type so we do not import or mutate CKF code.
 */

import { createHash } from "node:crypto";
import type { DefinitionExample, KnowledgeFactoryExport, SourceIdentity } from "./schema";

/** Local mirror of CKF DefinitionRecord — do not import CKF modules. */
export interface KfDefinitionRecord {
  term: string;
  sourceId: string;
  nodeId?: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  /** Encyclopedia extensions (additive; CKF may ignore unknown fields). */
  encyclopediaExampleId: string;
  exactTextSha256: string;
  declarationKind: string;
  representationLevel: "SOURCE_ONLY";
  verificationStatus: "SOURCE_ONLY";
  capacityCalculationAllowed: boolean;
}

export interface KfSourceEnvelope {
  sourceId: string;
  issuerCik?: string;
  issuerTicker?: string;
  issuerName?: string;
  accessionNumber?: string;
  sourceUrl?: string;
  filingDate?: string;
  formType?: string;
  documentTitle: string;
  documentClass: string;
  originalBytesHash?: string;
  normalizedTextHash: string;
  retrievalPath: string;
  agreementVersion: string;
  representationLevel: "SOURCE_ONLY";
  verificationStatus: "SOURCE_ONLY";
  provenance: string;
  usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" | "FIXTURE_INTERNAL";
}

export interface KfImportBatch {
  adapterVersion: "definition-encyclopedia-kf-adapter.v1";
  schemaCompatibility: {
    target: "knowledge-factory.v1 DefinitionRecord (structural mirror)";
    modifiesForeignSchema: false;
    paidInference: false;
  };
  generatedFromExportKind: string;
  exportContentDigest: string;
  sources: KfSourceEnvelope[];
  definitions: KfDefinitionRecord[];
  stats: {
    sourceCount: number;
    definitionCount: number;
    idempotencyKey: string;
  };
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function sourceEnvelope(src: SourceIdentity, acquiredMeta?: Record<string, unknown>): KfSourceEnvelope {
  const edgar = src.sourceId.startsWith("edgar:") || src.sourceId.startsWith("ehb:");
  return {
    sourceId: src.sourceId,
    issuerCik: typeof acquiredMeta?.issuerCik === "string" ? acquiredMeta.issuerCik : undefined,
    issuerTicker: typeof acquiredMeta?.issuerTicker === "string" ? acquiredMeta.issuerTicker : undefined,
    issuerName: typeof acquiredMeta?.issuerTitle === "string" ? acquiredMeta.issuerTitle : undefined,
    accessionNumber: typeof acquiredMeta?.accessionNumber === "string" ? acquiredMeta.accessionNumber : undefined,
    sourceUrl: typeof acquiredMeta?.sourceUri === "string" ? acquiredMeta.sourceUri : undefined,
    filingDate: typeof acquiredMeta?.filingDate === "string" ? acquiredMeta.filingDate : undefined,
    formType: typeof acquiredMeta?.formType === "string" ? acquiredMeta.formType : undefined,
    documentTitle: src.documentLabel,
    documentClass: src.documentType,
    originalBytesHash: typeof acquiredMeta?.originalBytesHash === "string" ? acquiredMeta.originalBytesHash : undefined,
    normalizedTextHash: src.textSha256,
    retrievalPath: src.retrievalPath,
    agreementVersion: src.agreementVersion,
    representationLevel: "SOURCE_ONLY",
    verificationStatus: "SOURCE_ONLY",
    provenance: `WS-DEF definition-encyclopedia; packageKey=${src.packageKey}; documentId=${src.documentId}`,
    usageRightsReviewStatus: edgar ? "PUBLIC_SEC_EDGAR" : "FIXTURE_INTERNAL",
  };
}

function toKfDefinition(ex: DefinitionExample): KfDefinitionRecord {
  return {
    term: ex.exactTerm,
    sourceId: ex.source.sourceId,
    charStart: ex.charStart,
    charEnd: ex.charEnd,
    excerpt: ex.exactText.slice(0, 500),
    encyclopediaExampleId: ex.exampleId,
    exactTextSha256: ex.exactTextSha256,
    declarationKind: ex.declarationKind,
    representationLevel: "SOURCE_ONLY",
    verificationStatus: "SOURCE_ONLY",
    capacityCalculationAllowed: ex.declarationKind === "FORWARDING" ? false : false,
  };
}

/**
 * Build an idempotent KF import batch from an encyclopedia export.
 * Re-running on the same export content yields the same idempotencyKey and record identities.
 */
export function buildKfImportBatch(
  exportDoc: KnowledgeFactoryExport,
  acquiredMetaBySourceId: Record<string, Record<string, unknown>> = {},
): KfImportBatch {
  const definitions = exportDoc.definitions.map(toKfDefinition);
  const sources = exportDoc.sources.map((s) => sourceEnvelope(s, acquiredMetaBySourceId[s.sourceId]));
  const exportContentDigest = sha256(
    exportDoc.definitions.map((d) => `${d.exampleId}:${d.exactTextSha256}`).join("|"),
  );
  const idempotencyKey = sha256(
    JSON.stringify({
      sources: sources.map((s) => [s.sourceId, s.normalizedTextHash]),
      defs: definitions.map((d) => [d.encyclopediaExampleId, d.exactTextSha256, d.charStart, d.charEnd]),
    }),
  );

  return {
    adapterVersion: "definition-encyclopedia-kf-adapter.v1",
    schemaCompatibility: {
      target: "knowledge-factory.v1 DefinitionRecord (structural mirror)",
      modifiesForeignSchema: false,
      paidInference: false,
    },
    generatedFromExportKind: exportDoc.exportKind,
    exportContentDigest,
    sources,
    definitions,
    stats: {
      sourceCount: sources.length,
      definitionCount: definitions.length,
      idempotencyKey,
    },
  };
}

/** Prove idempotent import: two builds from the same export share identities. */
export function assertIdempotentImport(a: KfImportBatch, b: KfImportBatch): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (a.stats.idempotencyKey !== b.stats.idempotencyKey) mismatches.push("idempotencyKey mismatch");
  if (a.exportContentDigest !== b.exportContentDigest) mismatches.push("exportContentDigest mismatch");
  if (a.definitions.length !== b.definitions.length) mismatches.push("definitionCount mismatch");
  const aIds = a.definitions.map((d) => d.encyclopediaExampleId).sort();
  const bIds = b.definitions.map((d) => d.encyclopediaExampleId).sort();
  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (aIds[i] !== bIds[i]) {
      mismatches.push(`exampleId order/identity mismatch at ${i}`);
      break;
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
