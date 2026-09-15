/**
 * F-7C.1 - SOURCE-BOUND RESUME of a frozen Pass A inventory.
 *
 * candidateRef is a routing label. It says which provision a frozen inventory was made FOR, never what source it was
 * made FROM. Resuming a frozen inventory therefore requires proof that it belongs to the exact source context being
 * compiled now, established with the SAME identity model F-5.3B's ensemble gate already uses (source-identity.ts):
 *
 *   - candidate identity must match (routing);
 *   - document identity must match wherever the inventory recorded one;
 *   - a CURRENT-generation inventory (carries sourceContextHash) must hash-match the current resolved source context
 *     exactly - an explicit mismatch is a mismatch, never a reason to fall back to re-anchoring;
 *   - a LEGACY inventory (no sourceContextHash) may be resumed only after deterministic re-anchoring proves every
 *     source-bearing part of it (item regions, offsets, verbatim excerpts, quantitative spans, unaccounted spans,
 *     uninventoried values, recorded partition, source-context state) against the current source - the existing
 *     VERIFIED_BY_RE_ANCHORING migration, failing closed on any mismatch.
 *
 * Nothing here mutates the supplied inventory: a legacy inventory that verifies is returned as an EPHEMERAL stamped
 * copy (frozenContentHash untouched, so every shard hash and the plan hash are unchanged). The historical evidence
 * on disk is never rewritten.
 */
import { computeSourceContextHash, stampVerifiedSourceIdentity, verifyInventoryAgainstSource, type ReAnchorFailure } from "../semantic-accountability/source-identity";
import { partitionSourceSlots } from "../semantic-accountability/slots";
import type { FrozenSemanticInventory, SourceContextResult } from "../semantic-accountability/types";
import type { StructuralIndex } from "../structural-index";

export type FrozenInventoryResumeMethod = "RECORDED_SOURCE_CONTEXT_HASH" | "VERIFIED_BY_RE_ANCHORING";

export interface FrozenInventoryResumeRecord {
  method: FrozenInventoryResumeMethod;
  candidateRef: string;
  documentId: string;
  frozenContentHash: string;
  /** The hash of the CURRENT resolved source context, which the inventory was proven to belong to. */
  sourceContextHash: string;
  partitionHash: string | null;
  /** Legacy path only: how many source-bearing checks re-anchored (items, values, unaccounted spans, uninventoried values). */
  reAnchoredChecks: number | null;
  verifiedAt: string;
}

export type FrozenInventoryResumeDecision =
  | { ok: true; inventory: FrozenSemanticInventory; record: FrozenInventoryResumeRecord }
  | { ok: false; failures: ReAnchorFailure[] };

export interface FrozenInventoryResumeInput {
  candidateRef: string;
  sourceDocumentId: string;
  frozenInventory: FrozenSemanticInventory;
  /** The source context resolved for THIS request (resolveSourceContext) - the decision cannot be made before it exists. */
  sourceContext: SourceContextResult;
  structuralIndex: StructuralIndex | null;
  now?: () => string;
}

export function validateFrozenInventoryResume(input: FrozenInventoryResumeInput): FrozenInventoryResumeDecision {
  const { frozenInventory: inv, sourceContext } = input;
  const failures: ReAnchorFailure[] = [];
  if (inv.candidateRef !== input.candidateRef) failures.push({ check: "candidate", detail: `frozen inventory belongs to candidate ${inv.candidateRef}, not ${input.candidateRef}` });
  if (inv.documentId && inv.documentId !== input.sourceDocumentId) failures.push({ check: "document", detail: `frozen inventory records document ${inv.documentId}, but this compilation is over ${input.sourceDocumentId}` });
  if (failures.length > 0) return { ok: false, failures };

  const currentHash = computeSourceContextHash(sourceContext);
  const now = input.now ?? (() => new Date().toISOString());

  if (inv.sourceContextHash) {
    // Current-generation evidence: the recorded identity is authoritative. A mismatch is a mismatch.
    if (inv.sourceContextHash !== currentHash) return { ok: false, failures: [{ check: "source-context-hash", detail: `frozen inventory records source-context hash ${inv.sourceContextHash.slice(0, 12)}…, the current resolved source context hashes to ${currentHash.slice(0, 12)}…` }] };
    if (inv.sourceContextState !== sourceContext.state) return { ok: false, failures: [{ check: "source-state", detail: `recorded source-context state ${inv.sourceContextState} differs from the current ${sourceContext.state}` }] };
    return { ok: true, inventory: inv, record: { method: "RECORDED_SOURCE_CONTEXT_HASH", candidateRef: inv.candidateRef, documentId: input.sourceDocumentId, frozenContentHash: inv.frozenContentHash, sourceContextHash: currentHash, partitionHash: inv.sourceIdentity?.partitionHash ?? null, reAnchoredChecks: null, verifiedAt: now() } };
  }

  // Legacy evidence: deterministic re-anchoring against the current source, failing closed. The partition is only
  // compared when the inventory recorded one (pre-partition evidence has nothing to compare).
  const partition = partitionSourceSlots({ sourceContext, structuralIndex: input.structuralIndex });
  const reAnchor = verifyInventoryAgainstSource(inv, sourceContext, partition);
  if (reAnchor.length > 0) return { ok: false, failures: reAnchor };
  const stamped = stampVerifiedSourceIdentity(inv, sourceContext, partition, now); // ephemeral copy; frozenContentHash untouched
  const checks = inv.items.length + inv.items.reduce((a, i) => a + i.quantitativeValues.filter((v) => v.charStart >= 0).length, 0) + (inv.unaccountedSource?.length ?? 0) + (inv.uninventoriedValues?.filter((v) => v.charStart >= 0).length ?? 0);
  return { ok: true, inventory: stamped, record: { method: "VERIFIED_BY_RE_ANCHORING", candidateRef: inv.candidateRef, documentId: stamped.documentId ?? input.sourceDocumentId, frozenContentHash: inv.frozenContentHash, sourceContextHash: currentHash, partitionHash: stamped.sourceIdentity?.partitionHash ?? null, reAnchoredChecks: checks, verifiedAt: stamped.sourceIdentity?.verifiedAt ?? now() } };
}
