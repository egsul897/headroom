import type { CovenantKnowledgeStore } from "./store";
import type { KnowledgeRecord } from "./schema";

export type InvalidationTrigger =
  | "DOCUMENT_CHANGED"
  | "DEFINITION_CHANGED"
  | "AMENDMENT_CHANGED"
  | "COMPILER_VERSION_CHANGED"
  | "CONTROLLING_DEPENDENCY_CHANGED"
  | "MANUAL";

export interface InvalidationEvent {
  trigger: InvalidationTrigger;
  reason: string;
  /** Content hashes / record ids that changed. */
  changedRefs: string[];
  compilerVersion?: string | null;
  at: string;
}

/**
 * Safe invalidation: mark dependent semantic hypotheses and unverified
 * representations INVALIDATED when documents, definitions, amendments,
 * compiler versions, or controlling dependencies change.
 */
export function invalidateAffectedRecords(
  store: CovenantKnowledgeStore,
  event: InvalidationEvent
): KnowledgeRecord[] {
  const changed = new Set(event.changedRefs);
  const updated: KnowledgeRecord[] = [];
  for (const rec of store.list()) {
    if (rec.verificationStatus === "INVALIDATED") continue;
    const hitsDependency = rec.dependencies.some((d) => changed.has(d));
    const hitsContext = rec.provenance.contextHash != null && changed.has(rec.provenance.contextHash);
    const hitsCompiler =
      event.trigger === "COMPILER_VERSION_CHANGED" &&
      event.compilerVersion != null &&
      rec.provenance.compilerVersion != null &&
      rec.provenance.compilerVersion !== event.compilerVersion;
    const hitsDocument = rec.documentId != null && changed.has(rec.documentId);
    if (!(hitsDependency || hitsContext || hitsCompiler || hitsDocument || event.trigger === "MANUAL" && changed.has(rec.recordId))) {
      continue;
    }
    // Structural facts may be reused after re-extraction; semantic interpretations must not linger.
    if (rec.kind === "DETERMINISTIC_FACT" || rec.kind === "SOURCE_DOCUMENT" || rec.kind === "STRUCTURAL_PROVISION") {
      if (event.trigger === "DOCUMENT_CHANGED" && hitsDocument) {
        const next = store.put({
          ...rec,
          recordId: `${rec.recordId}::invalidated::${event.at}`,
          verificationStatus: "INVALIDATED",
          invalidatedBy: event.reason,
          modelGenerated: rec.modelGenerated,
          body: { ...rec.body, invalidation: event },
          provenance: { ...rec.provenance, createdAt: new Date().toISOString() },
        });
        updated.push(next);
      }
      continue;
    }
    const next = store.put({
      ...rec,
      recordId: `${rec.recordId}::invalidated::${event.at}`,
      verificationStatus: "INVALIDATED",
      invalidatedBy: event.reason,
      modelGenerated: rec.modelGenerated,
      body: { ...rec.body, invalidation: event },
      provenance: { ...rec.provenance, createdAt: new Date().toISOString() },
    });
    updated.push(next);
  }
  return updated;
}
