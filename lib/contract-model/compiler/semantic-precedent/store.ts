/**
 * Phase 3D - in-memory persistence for ReviewedInstance / GeneralizedPrecedent
 * (task §46). Mirrors semantic/cache.ts's own InMemorySemanticCompilationCache
 * pattern exactly: a small interface (PrecedentStore) any future
 * Postgres-backed implementation can drop in without changing any caller
 * (generalization.ts, retrieval.ts, applicability.ts, compiler/verifier
 * integration) - never a redesign of those modules' own orchestration.
 *
 * Two invariants enforced here, not left to callers:
 *  - Append-only review history (task §5/§27): appendReviewedInstanceEvent /
 *    appendPrecedentReviewEvent always push a new PrecedentReviewEvent onto
 *    the existing array and never replace or drop a prior event - the same
 *    "never overwrite prior decisions" discipline CandidateReviewEvent's
 *    real schema already enforces (prisma/schema.prisma's own append-only
 *    review-event-log design), reproduced as a pattern, not the literal
 *    schema (task §46's own persistence-justification requirement).
 *  - Approved precedent is never silently mutated in place (task §31):
 *    supersedePrecedent() never edits the old GeneralizedPrecedent object -
 *    it stores a new object (new precedentId, version + 1) and sets
 *    supersedesPrecedentId/supersededByPrecedentId on both sides.
 */
import type { GeneralizedPrecedent, PrecedentReviewEvent, PrecedentTenancyScope, ReviewedInstance, ReviewStatus } from "./types";

export interface ReviewedInstanceFilter {
  tenancy?: PrecedentTenancyScope;
  reviewStatus?: ReviewStatus[];
  excludePackageIds?: string[];
  excludeCompanyIds?: string[];
  excludeSourceDocumentIds?: string[];
}

export interface GeneralizedPrecedentFilter {
  tenancy?: PrecedentTenancyScope;
  reviewStatus?: ReviewStatus[];
  /** task §57's own "excluding all precedent derived from the target package" - filters on supporting-instance provenance, resolved by the caller against the ReviewedInstance store (this store has no cross-reference join of its own). */
  excludePrecedentIds?: string[];
  includeSuperseded?: boolean;
  /**
   * Task §46's own tenant-isolation invariant, enforced here regardless of
   * any other filter field: a TENANT_PRIVATE precedent is visible ONLY when
   * viewerCompanyId is supplied AND equals that precedent's own
   * ownerCompanyId - SYSTEM_REVIEWED precedent is unaffected by this field
   * and remains visible to every viewer. Omitting viewerCompanyId is the
   * SAFE default (excludes every TENANT_PRIVATE precedent, never leaks one
   * company's private precedent to a caller that forgot to scope its
   * query) - it is never an escape hatch back to "return everything."
   */
  viewerCompanyId?: string;
}

function matchesReviewedInstanceFilter(instance: ReviewedInstance, filter?: ReviewedInstanceFilter): boolean {
  if (!filter) return true;
  if (filter.tenancy && instance.tenancy !== filter.tenancy) return false;
  if (filter.reviewStatus && !filter.reviewStatus.includes(instance.reviewStatus)) return false;
  if (filter.excludePackageIds && instance.provenance.benchmark && filter.excludePackageIds.includes(instance.provenance.benchmark.packageId)) return false;
  if (filter.excludeCompanyIds && filter.excludeCompanyIds.includes(instance.provenance.companyId)) return false;
  if (filter.excludeSourceDocumentIds && filter.excludeSourceDocumentIds.includes(instance.provenance.sourceDocumentId)) return false;
  return true;
}

function matchesGeneralizedPrecedentFilter(precedent: GeneralizedPrecedent, filter?: GeneralizedPrecedentFilter): boolean {
  // Unlike matchesReviewedInstanceFilter, an absent filter is NOT a no-op here: excluding
  // superseded precedent from the default listing is itself the invariant (task §31 - approved
  // precedent is versioned, never silently mutated, and a superseded version must not keep
  // showing up as active just because the caller passed no filter at all).
  if (filter?.tenancy && precedent.tenancy !== filter.tenancy) return false;
  if (filter?.reviewStatus && !filter.reviewStatus.includes(precedent.reviewStatus)) return false;
  if (filter?.excludePrecedentIds && filter.excludePrecedentIds.includes(precedent.precedentId)) return false;
  if (!filter?.includeSuperseded && precedent.supersededByPrecedentId !== null) return false;
  if (precedent.tenancy === "TENANT_PRIVATE" && (!filter?.viewerCompanyId || filter.viewerCompanyId !== precedent.ownerCompanyId)) return false;
  return true;
}

export interface PrecedentStore {
  saveReviewedInstance(instance: ReviewedInstance): void;
  getReviewedInstance(instanceId: string): ReviewedInstance | null;
  listReviewedInstances(filter?: ReviewedInstanceFilter): ReviewedInstance[];
  appendReviewedInstanceEvent(instanceId: string, event: PrecedentReviewEvent, newStatus: ReviewStatus): ReviewedInstance;

  saveGeneralizedPrecedent(precedent: GeneralizedPrecedent): void;
  getGeneralizedPrecedent(precedentId: string): GeneralizedPrecedent | null;
  listGeneralizedPrecedents(filter?: GeneralizedPrecedentFilter): GeneralizedPrecedent[];
  appendPrecedentReviewEvent(precedentId: string, event: PrecedentReviewEvent, newStatus: ReviewStatus): GeneralizedPrecedent;
  /** Never mutates `oldPrecedentId`'s object - stores `newPrecedent` as a distinct entry and cross-links both. */
  supersedePrecedent(oldPrecedentId: string, newPrecedent: GeneralizedPrecedent): void;
}

export class InMemoryPrecedentStore implements PrecedentStore {
  private readonly reviewedInstances = new Map<string, ReviewedInstance>();
  private readonly generalizedPrecedents = new Map<string, GeneralizedPrecedent>();

  saveReviewedInstance(instance: ReviewedInstance): void {
    this.reviewedInstances.set(instance.instanceId, instance);
  }

  getReviewedInstance(instanceId: string): ReviewedInstance | null {
    return this.reviewedInstances.get(instanceId) ?? null;
  }

  listReviewedInstances(filter?: ReviewedInstanceFilter): ReviewedInstance[] {
    return [...this.reviewedInstances.values()].filter((i) => matchesReviewedInstanceFilter(i, filter));
  }

  appendReviewedInstanceEvent(instanceId: string, event: PrecedentReviewEvent, newStatus: ReviewStatus): ReviewedInstance {
    const existing = this.reviewedInstances.get(instanceId);
    if (!existing) throw new Error(`appendReviewedInstanceEvent: no ReviewedInstance found for instanceId ${instanceId}`);
    const updated: ReviewedInstance = { ...existing, reviewStatus: newStatus, reviewEvents: [...existing.reviewEvents, event] };
    this.reviewedInstances.set(instanceId, updated);
    return updated;
  }

  saveGeneralizedPrecedent(precedent: GeneralizedPrecedent): void {
    this.generalizedPrecedents.set(precedent.precedentId, precedent);
  }

  getGeneralizedPrecedent(precedentId: string): GeneralizedPrecedent | null {
    return this.generalizedPrecedents.get(precedentId) ?? null;
  }

  listGeneralizedPrecedents(filter?: GeneralizedPrecedentFilter): GeneralizedPrecedent[] {
    return [...this.generalizedPrecedents.values()].filter((p) => matchesGeneralizedPrecedentFilter(p, filter));
  }

  appendPrecedentReviewEvent(precedentId: string, event: PrecedentReviewEvent, newStatus: ReviewStatus): GeneralizedPrecedent {
    const existing = this.generalizedPrecedents.get(precedentId);
    if (!existing) throw new Error(`appendPrecedentReviewEvent: no GeneralizedPrecedent found for precedentId ${precedentId}`);
    const updated: GeneralizedPrecedent = { ...existing, reviewStatus: newStatus, reviewEvents: [...existing.reviewEvents, event], updatedAt: new Date().toISOString() };
    this.generalizedPrecedents.set(precedentId, updated);
    return updated;
  }

  supersedePrecedent(oldPrecedentId: string, newPrecedent: GeneralizedPrecedent): void {
    const old = this.generalizedPrecedents.get(oldPrecedentId);
    if (!old) throw new Error(`supersedePrecedent: no GeneralizedPrecedent found for precedentId ${oldPrecedentId}`);
    if (newPrecedent.supersedesPrecedentId !== oldPrecedentId) {
      throw new Error(`supersedePrecedent: newPrecedent.supersedesPrecedentId must equal ${oldPrecedentId}`);
    }
    const updatedOld: GeneralizedPrecedent = { ...old, supersededByPrecedentId: newPrecedent.precedentId, updatedAt: new Date().toISOString() };
    this.generalizedPrecedents.set(oldPrecedentId, updatedOld);
    this.generalizedPrecedents.set(newPrecedent.precedentId, newPrecedent);
  }
}
