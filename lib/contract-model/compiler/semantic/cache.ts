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
 */
export function computeCacheKey(input: SemanticCompilerInput, providerIdentity: string): string {
  return hashParts([
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
