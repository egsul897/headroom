/**
 * Phase 3B - cache identity + resumability (task §31/§32/§33/§34). Reuses
 * the exact hashParts/hashJson primitives every other compiler submodule
 * already uses (lib/contract-model/compiler/hashing.ts) - never a second
 * hashing convention.
 *
 * PERSISTENCE DESIGN DECISION (task §34): an in-memory Map is this V1's
 * own implementation, matching Phase 3A's own "pure in-memory, zero
 * Prisma migration" precedent (see semantic/types.ts's own module header
 * for the full reasoning) - the interface below is written so a future
 * Postgres-backed implementation (a new, additive model, never touching
 * ContractCompilerRun/ContractCompilerStage, which the Roadmap's own
 * migration table explicitly says not to build Phase 3B on top of) is a
 * drop-in swap of this one interface, not a redesign of compile.ts's own
 * orchestration logic.
 */
import { hashParts } from "../hashing";
import type { SemanticCompilationResult, SemanticCompilerInput } from "./types";

/**
 * Cache identity (task §31) - invalidated by ANY of: the operative source
 * content itself, the context bundle's own contentIdentity (already a
 * real, computed hash - context-retrieval/identity.ts's own
 * computeContentIdentity), IR schema version, compiler prompt/algorithm/
 * tool-policy version, and provider/model identity. A resumed attempt
 * whose cache key still matches is safe to reuse verbatim; any change to
 * any of these invalidates it, exactly mirroring orchestrator.ts's own
 * inputHash discipline for the Phase C pipeline.
 *
 * Phase 3F.1.4 (P1-1 remediation, docs/foundation-assurance/02-tenant-
 * instrument-isolation-results.json's `semantic-compiler-default-cache-
 * cross-tenant` finding): this formula never included `companyId`,
 * `instrumentKey`, or `sourceDocumentId` - two different companies' own
 * byte-identical drafting (same candidateRef, same operativeSourceText,
 * same contextBundle.contentIdentity - a real, reachable case: a trivial,
 * self-contained covenant with no cross-references produces a
 * contentIdentity that is not itself company-scoped by design) collided
 * onto the SAME cache entry, and the second company's request was served
 * the first company's cached SemanticCompilationResult object identity with
 * the model never invoked. Fixed by adding all three of this input's own
 * real tenant/instrument-identifying fields to the key - the actual
 * isolation boundary (invariant #19/#20), not merely another attribute of
 * the drafting content.
 *
 * DESIGN DECISION (disclosed): a per-tenant/per-instrument cache-SCOPE
 * wrapper (a Map-of-Maps or a keyed sub-cache per companyId/instrumentKey)
 * was considered instead of extending this single flat key. Rejected here
 * as unnecessary complexity: once companyId/instrumentKey/sourceDocumentId
 * are themselves part of the content hash, two tenants' entries can no more
 * collide than two different candidateRefs' entries already could - the
 * SAME mechanism that has always given every other field on this list its
 * isolation now gives these three theirs, with no second data structure, no
 * second eviction policy, and no risk of the wrapper's own scoping key
 * formula drifting out of sync with this one over time. A structural
 * per-tenant wrapper would earn its complexity if a FUTURE need arose for
 * per-tenant cache quotas/eviction/introspection (e.g. "evict everything for
 * company X on demand") that a flat key cannot serve - worth revisiting then,
 * not preemptively built now for a need that does not yet exist.
 */
export function computeCacheKey(input: SemanticCompilerInput, providerIdentity: string): string {
  return hashParts([
    input.companyId,
    input.instrumentKey,
    input.sourceDocumentId,
    input.candidateRef,
    input.operativeSourceText,
    input.contextBundle.contentIdentity,
    input.operativeLineage?.operativeStatus ?? "(never-amended)",
    input.operativeLineage?.currentSourceDocumentId ?? "",
    input.irSchemaVersion,
    input.compilerAlgorithmVersion,
    input.compilerPromptVersion,
    input.toolPolicyVersion,
    providerIdentity,
  ]);
}

export interface SemanticCompilationCache {
  get(cacheKey: string): SemanticCompilationResult | null;
  set(cacheKey: string, result: SemanticCompilationResult): void;
}

export class InMemorySemanticCompilationCache implements SemanticCompilationCache {
  private readonly store = new Map<string, SemanticCompilationResult>();

  get(cacheKey: string): SemanticCompilationResult | null {
    return this.store.get(cacheKey) ?? null;
  }

  set(cacheKey: string, result: SemanticCompilationResult): void {
    this.store.set(cacheKey, result);
  }
}
