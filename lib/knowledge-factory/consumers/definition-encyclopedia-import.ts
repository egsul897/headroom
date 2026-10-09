/**
 * Independent Definition Encyclopedia consumer import against CKF canonical export.
 * Mirrors peer adapter expectations: SOURCE_ONLY, upsert by sourceId + span, idempotent.
 */

import { createHash } from "node:crypto";
import type { CanonicalConsumerExport, ConsumerDefinition, ConsumerSourceRecord } from "../export/consumer-contract";

export const DEFINITION_ENCYCLOPEDIA_ADAPTER_VERSION = "definition-encyclopedia-kf-adapter.v1";

export interface EncyclopediaImportedDefinition {
  term: string;
  sourceId: string;
  nodeId?: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  encyclopediaExampleId: string;
  exactTextSha256: string;
  representationLevel: "SOURCE_ONLY";
  verificationStatus: "SOURCE_ONLY";
  capacityCalculationAllowed: false;
}

export interface EncyclopediaImportResult {
  consumer: "Definition Encyclopedia";
  adapterVersion: typeof DEFINITION_ENCYCLOPEDIA_ADAPTER_VERSION;
  ok: boolean;
  pass: 1 | 2;
  sourceVersionId: string;
  sourcesUpserted: number;
  sourcesSkipped: number;
  definitionsUpserted: number;
  definitionsSkipped: number;
  canonicalSourceIds: string[];
  idempotent: boolean;
  promotedToLegalTruth: 0;
  capacityCalculationAllowed: false;
  errors: string[];
}

export class DefinitionEncyclopediaImportStore {
  sources = new Map<string, ConsumerSourceRecord>();
  definitions = new Map<string, EncyclopediaImportedDefinition>();

  private key(d: Pick<ConsumerDefinition, "sourceId" | "charStart" | "charEnd" | "term">): string {
    return `${d.sourceId}|${d.term}|${d.charStart}|${d.charEnd}`;
  }

  importFromCanonical(exportDoc: CanonicalConsumerExport, pass: 1 | 2): EncyclopediaImportResult {
    const errors: string[] = [];
    let sourcesUpserted = 0;
    let sourcesSkipped = 0;
    let definitionsUpserted = 0;
    let definitionsSkipped = 0;

    if (exportDoc.schemaVersion !== "knowledge-factory.consumer-export.v1") {
      errors.push(`unexpected schemaVersion ${exportDoc.schemaVersion}`);
    }

    for (const s of exportDoc.sources) {
      if (this.sources.has(s.sourceId)) {
        sourcesSkipped += 1;
        continue;
      }
      this.sources.set(s.sourceId, s);
      sourcesUpserted += 1;
    }

    for (const d of exportDoc.definitions) {
      if (!this.sources.has(d.sourceId) && !exportDoc.sources.some((s) => s.sourceId === d.sourceId)) {
        errors.push(`definition references missing sourceId ${d.sourceId}`);
        continue;
      }
      // Ensure source exists even if filtered earlier
      const src = exportDoc.sources.find((s) => s.sourceId === d.sourceId);
      if (src && !this.sources.has(src.sourceId)) {
        this.sources.set(src.sourceId, src);
        sourcesUpserted += 1;
      }

      const k = this.key(d);
      if (this.definitions.has(k)) {
        definitionsSkipped += 1;
        continue;
      }
      const exactTextSha256 = createHash("sha256").update(d.excerpt).digest("hex");
      this.definitions.set(k, {
        term: d.term,
        sourceId: d.sourceId,
        nodeId: d.nodeId,
        charStart: d.charStart,
        charEnd: d.charEnd,
        excerpt: d.excerpt,
        encyclopediaExampleId: `ex:${d.sourceId}:${d.charStart}:${d.charEnd}`,
        exactTextSha256,
        representationLevel: "SOURCE_ONLY",
        verificationStatus: "SOURCE_ONLY",
        capacityCalculationAllowed: false,
      });
      definitionsUpserted += 1;
    }

    const idempotent = pass === 2 && sourcesUpserted === 0 && definitionsUpserted === 0 && errors.length === 0;

    return {
      consumer: "Definition Encyclopedia",
      adapterVersion: DEFINITION_ENCYCLOPEDIA_ADAPTER_VERSION,
      ok: errors.length === 0,
      pass,
      sourceVersionId: exportDoc.sourceVersionId,
      sourcesUpserted,
      sourcesSkipped,
      definitionsUpserted,
      definitionsSkipped,
      canonicalSourceIds: [...this.sources.keys()].sort(),
      idempotent,
      promotedToLegalTruth: 0,
      capacityCalculationAllowed: false,
      errors,
    };
  }
}

export function runDefinitionEncyclopediaImport(exportDoc: CanonicalConsumerExport): {
  pass1: EncyclopediaImportResult;
  pass2: EncyclopediaImportResult;
  sharedSourceIdsWithExport: boolean;
} {
  const store = new DefinitionEncyclopediaImportStore();
  const pass1 = store.importFromCanonical(exportDoc, 1);
  const pass2 = store.importFromCanonical(exportDoc, 2);
  const exportIds = new Set(exportDoc.sources.map((s) => s.sourceId));
  const sharedSourceIdsWithExport =
    pass1.canonicalSourceIds.length === exportIds.size &&
    pass1.canonicalSourceIds.every((id) => exportIds.has(id));
  return { pass1, pass2, sharedSourceIdsWithExport };
}
