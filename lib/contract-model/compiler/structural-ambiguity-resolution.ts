/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1) - the async
 * phase-2 resolver that turns stage-structure.ts's own deterministic AMBIGUOUS
 * candidates (from `parseDocumentStructureWithTriage`) into a final, resolved
 * node list, by calling the bounded structural-ambiguity classifier ONLY for
 * those candidates and applying its verdicts through
 * `applyStructuralAmbiguityOverrides`.
 *
 * Kept deliberately separate from stage-structure.ts (which stays "pure,
 * deterministic, no LLM call" per its own module header) - this is the one
 * place in the pipeline that actually touches the classifier and a
 * cache/identity, mirroring how condition-suspicion-classifier.ts's own call
 * site (verify.ts) is kept separate from the classifier module itself.
 *
 * ===========================================================================
 * FAIL-CLOSED POLICY (see docs/phase-3f1-human-architecture-decision/
 * 03-structural-classifier-design.json for the full design record)
 * ===========================================================================
 * LIKELY_HEADING may create a structural boundary (an override entry of
 * `true`). LIKELY_PROSE_REFERENCE must not (an override entry of `false`,
 * which is also `applyStructuralAmbiguityOverrides`'s own default for an
 * absent key - so this is actually a no-op override, kept explicit here for
 * audit clarity). UNCERTAIN - and any classifier failure, timeout, malformed
 * output, or synthetic-provider fallback (`isSynthetic`/`failed` on the
 * result) - must NEVER silently create a structural boundary: no override
 * entry is added at all, so `applyStructuralAmbiguityOverrides` falls through
 * to its own fail-closed default (excluded). Every such candidate is instead
 * surfaced as a `StructuralReviewSignal` - this module's own bounded
 * analogue of the "propagate structural health / produce a review-state
 * signal" discipline lib/contract-model/compiler/safe-failure/*
 * (ClaimReviewItem-shaped, Prisma-persisted) and structural-index.ts's own
 * StructuralHealthFinding already establish elsewhere in this codebase - kept
 * as a plain, returned, in-memory record here rather than a new persisted
 * table, since this workstream's scope is the parsing mechanism itself, not
 * a new persistence surface; a caller that wants these persisted can map
 * them onto ClaimReviewItemInput/StructuralHealthFinding at the call site
 * exactly as those existing consumers already do for their own domains.
 */
import { classifyStructuralAmbiguity, type StructuralAmbiguityCache, type StructuralAmbiguityCacheIdentity, type StructuralAmbiguityClassifierResult } from "./structural-ambiguity-classifier";
import { applyStructuralAmbiguityOverrides, parseDocumentStructureWithTriage, structuralCandidateKey, type AmbiguousStructuralCandidate } from "./stage-structure";
import type { CompilerDocumentInput, StructuralNode } from "./types";
import type { StageCaller } from "./llm-caller";

/** One candidate's resolution outcome - kept even when no override was applied (UNCERTAIN/failed), so callers get full audit visibility into every AMBIGUOUS candidate the pipeline encountered. */
export interface StructuralAmbiguityResolution {
  candidate: AmbiguousStructuralCandidate;
  classifierResult: StructuralAmbiguityClassifierResult;
  /** true = LIKELY_HEADING (structural boundary created); false = LIKELY_PROSE_REFERENCE (explicitly kept out); null = UNCERTAIN or a failed/synthetic call - NO structural boundary was created, fail-closed. */
  appliedOverride: boolean | null;
}

/**
 * A bounded, in-memory review-state signal for a candidate the classifier
 * could not confidently resolve (UNCERTAIN, provider failure, malformed
 * output, or a no-credential synthetic fallback) - the fail-closed policy's
 * own "produce a review-state signal where material downstream analysis
 * depends on it" requirement. Never a persisted row on its own (see this
 * file's own header comment); a caller that needs persistence maps this onto
 * ClaimReviewItemInput/StructuralHealthFinding at its own call site.
 */
export interface StructuralReviewSignal {
  documentId: string;
  candidateType: "ARTICLE" | "SECTION";
  candidateKey: string;
  sourceEvidence: string;
  reason: string;
  classifierVerdict: StructuralAmbiguityClassifierResult["verdict"];
  classifierFailed: boolean;
  classifierIsSynthetic: boolean;
}

export interface StructuralAmbiguityResolutionRateMetrics {
  totalCandidates: number;
  /** Fraction of ALL candidates (confident + ambiguous) resolved with zero classifier calls - the governing spec's own "near-zero classifier calls for a normal contract" cost-discipline metric. */
  deterministicResolutionRate: number;
  ambiguousCount: number;
  classifierInvocationRate: number;
  likelyHeadingCount: number;
  likelyProseReferenceCount: number;
  uncertainCount: number;
  classifierFailureCount: number;
  classifierSyntheticCount: number;
  classifierCacheHitCount: number;
  /** Ambiguous candidates never even reaching a resolution attempt were never resolved into a structural boundary - always 0 in this module's own resolve function, since every ambiguous candidate is resolved exactly once; kept for callers that filter the resolutions array themselves before deriving stats. */
  unresolvedCount: number;
}

export function computeStructuralAmbiguityResolutionRateMetrics(totalDeterministicCandidates: number, resolutions: StructuralAmbiguityResolution[]): StructuralAmbiguityResolutionRateMetrics {
  const ambiguousCount = resolutions.length;
  const likelyHeadingCount = resolutions.filter((r) => r.classifierResult.verdict === "LIKELY_HEADING" && !r.classifierResult.failed).length;
  const likelyProseReferenceCount = resolutions.filter((r) => r.classifierResult.verdict === "LIKELY_PROSE_REFERENCE" && !r.classifierResult.failed).length;
  const uncertainCount = resolutions.filter((r) => r.appliedOverride === null).length;
  return {
    totalCandidates: totalDeterministicCandidates,
    deterministicResolutionRate: totalDeterministicCandidates === 0 ? 1 : (totalDeterministicCandidates - ambiguousCount) / totalDeterministicCandidates,
    ambiguousCount,
    classifierInvocationRate: totalDeterministicCandidates === 0 ? 0 : ambiguousCount / totalDeterministicCandidates,
    likelyHeadingCount,
    likelyProseReferenceCount,
    uncertainCount,
    classifierFailureCount: resolutions.filter((r) => r.classifierResult.failed).length,
    classifierSyntheticCount: resolutions.filter((r) => r.classifierResult.isSynthetic).length,
    classifierCacheHitCount: resolutions.filter((r) => r.classifierResult.fromCache).length,
    unresolvedCount: 0,
  };
}

/**
 * Resolves one document's AMBIGUOUS candidates (from `parseDocumentStructureWithTriage`)
 * through the bounded classifier and rebuilds the final node list via
 * `applyStructuralAmbiguityOverrides`. Cost discipline: exactly one
 * classifier call per AMBIGUOUS candidate (subject to the shared cache) -
 * never for a CONFIDENT_HEADING/CONFIDENT_PROSE_REFERENCE candidate, which
 * never appears in `ambiguousCandidates` to begin with.
 */
export async function resolveStructuralAmbiguity(
  doc: CompilerDocumentInput,
  ambiguousCandidates: AmbiguousStructuralCandidate[],
  identity: StructuralAmbiguityCacheIdentity,
  caller: StageCaller,
  cache?: StructuralAmbiguityCache
): Promise<{ nodes: StructuralNode[]; resolutions: StructuralAmbiguityResolution[]; reviewSignals: StructuralReviewSignal[] }> {
  const resolutions: StructuralAmbiguityResolution[] = [];
  const overrides = new Map<string, boolean>();

  for (const candidate of ambiguousCandidates) {
    const classifierResult = await classifyStructuralAmbiguity(
      {
        candidateType: candidate.candidateType,
        candidateNumber: candidate.candidateNumber,
        candidateText: candidate.candidateText,
        precedingWindow: candidate.precedingWindow,
        followingWindow: candidate.followingWindow,
        nearestConfidentHeadingBefore: candidate.nearestConfidentHeadingBefore,
        nearestConfidentHeadingAfter: candidate.nearestConfidentHeadingAfter,
      },
      identity,
      caller,
      cache
    );

    // Fail-closed: only an UNFAILED, non-synthetic CONFIDENT verdict may ever
    // set an override. A failed call, a synthetic-caller stub, or an
    // explicit UNCERTAIN verdict all leave `appliedOverride` null and add NO
    // entry to `overrides` - `applyStructuralAmbiguityOverrides` then falls
    // through to its own fail-closed default (excluded) for that candidate.
    let appliedOverride: boolean | null = null;
    if (!classifierResult.failed && !classifierResult.isSynthetic) {
      if (classifierResult.verdict === "LIKELY_HEADING") {
        overrides.set(candidate.candidateKey, true);
        appliedOverride = true;
      } else if (classifierResult.verdict === "LIKELY_PROSE_REFERENCE") {
        overrides.set(candidate.candidateKey, false);
        appliedOverride = false;
      }
    }
    resolutions.push({ candidate, classifierResult, appliedOverride });
  }

  const nodes = applyStructuralAmbiguityOverrides(doc, overrides);

  const reviewSignals: StructuralReviewSignal[] = resolutions
    .filter((r) => r.appliedOverride === null)
    .map((r) => ({
      documentId: doc.documentId,
      candidateType: r.candidate.candidateType,
      candidateKey: r.candidate.candidateKey,
      sourceEvidence: r.candidate.candidateText,
      reason: r.candidate.triage.reason,
      classifierVerdict: r.classifierResult.verdict,
      classifierFailed: r.classifierResult.failed,
      classifierIsSynthetic: r.classifierResult.isSynthetic,
    }));

  return { nodes, resolutions, reviewSignals };
}

// Re-exported for callers that only need the key helper alongside this module's own API.
export { structuralCandidateKey };

// =============================================================================
// Phase 3F.1 Human Architecture Decision (Workstream OPEN-1 WIRING FIX)
// =============================================================================
/**
 * This is the piece that was MISSING before this fix: the actual STRUCTURE-
 * stage entry point a real orchestrator calls, that (a) runs the pure,
 * deterministic triage (`parseDocumentStructureWithTriage`) per document,
 * (b) resolves each document's own AMBIGUOUS candidates through the bounded
 * classifier via `resolveStructuralAmbiguity` ONLY when that document
 * actually has any (cost discipline: a document with zero AMBIGUOUS
 * candidates costs exactly zero classifier calls, never even constructs a
 * cache identity for it), and (c) merges everything into one final
 * `StructuralNode[]` in the same shape/order `runStructureStage` always
 * produced, so every existing downstream consumer of the STRUCTURE stage's
 * `output` (persistStructuralNodes, structureOutputHash, every later stage
 * keyed off structural nodes) keeps working unmodified.
 *
 * `identity.instrumentKey`: neither orchestrator.ts (legacy Phase C) nor its
 * `CompilerPackageInput` has a real "instrument" concept distinct from the
 * package itself (that grouping is a Phase 2 substrate concept - see
 * package-graph/pipeline.ts) - callers in this pipeline generation pass their
 * own `packageKey` as `instrumentKey`, mirroring exactly how
 * classifyStructuralAmbiguity's own tenant-scoping only needs a stable,
 * unique-enough scope string, never a specific domain meaning.
 */
export interface StructureStageWithAmbiguityResolutionResult {
  /** Mirrors StageRunResult's own status vocabulary (kept as plain string literals here, deliberately not importing @prisma/client into this module - see this file's own module-boundary discipline). */
  status: "COMPLETED" | "REVIEW_REQUIRED";
  output: StructuralNode[];
  notes?: string[];
  /** Every AMBIGUOUS candidate across every document that the classifier could not confidently resolve (UNCERTAIN, provider failure, or a no-credential synthetic fallback) - fail-closed EXCLUDED from `output`, never silently dropped from the audit trail. */
  reviewSignals: StructuralReviewSignal[];
  /** Aggregate cost-discipline metrics across every document in this call - see `computeStructuralAmbiguityResolutionRateMetrics`'s own doc comment for each field's meaning. */
  metrics: StructuralAmbiguityResolutionRateMetrics;
}

export async function runStructureStageWithAmbiguityResolution(
  documents: CompilerDocumentInput[],
  identity: { companyId: string; instrumentKey: string },
  caller: StageCaller,
  cache?: StructuralAmbiguityCache
): Promise<StructureStageWithAmbiguityResolutionResult> {
  const allNodes: StructuralNode[] = [];
  const allResolutions: StructuralAmbiguityResolution[] = [];
  const allReviewSignals: StructuralReviewSignal[] = [];
  let totalCandidates = 0;

  for (const doc of documents) {
    const triage = parseDocumentStructureWithTriage(doc);
    totalCandidates += triage.triageStats.totalCandidates;

    // Cost discipline (this file's own header comment): a document with no
    // AMBIGUOUS candidates never even constructs a cache identity for
    // itself, let alone calls the classifier - `triage.nodes` already IS the
    // final node set for this document in that case (identical to what
    // `applyStructuralAmbiguityOverrides` with an empty override map would
    // recompute, since there is nothing in `overrides` to look up).
    if (triage.ambiguousCandidates.length === 0) {
      allNodes.push(...triage.nodes);
      continue;
    }

    const docIdentity: StructuralAmbiguityCacheIdentity = { companyId: identity.companyId, instrumentKey: identity.instrumentKey, sourceDocumentId: doc.documentId };
    const resolved = await resolveStructuralAmbiguity(doc, triage.ambiguousCandidates, docIdentity, caller, cache);
    allNodes.push(...resolved.nodes);
    allResolutions.push(...resolved.resolutions);
    allReviewSignals.push(...resolved.reviewSignals);
  }

  const metrics = computeStructuralAmbiguityResolutionRateMetrics(totalCandidates, allResolutions);

  const notes: string[] = [];
  if (allNodes.length === 0) {
    // Mirrors runStructureStage's own REVIEW_REQUIRED note verbatim - the
    // same real failure mode (no article/section headers matched any known
    // structural pattern at all), unrelated to the classifier.
    notes.push("No article/section headers matched any known structural pattern - structural inventory could not be built; every downstream stage's coverage claims are unreliable for this package until this is resolved.");
  }
  if (allReviewSignals.length > 0) {
    notes.push(
      `${allReviewSignals.length} structural candidate(s) across this package could not be confidently resolved as heading vs. in-prose-citation (classifier UNCERTAIN, a provider failure, or a no-credential synthetic fallback) and were fail-closed EXCLUDED from the structural index rather than guessed - see this stage's own reviewSignals for the exact document/candidate/reason for each.`
    );
  }

  return {
    status: allNodes.length === 0 ? "REVIEW_REQUIRED" : "COMPLETED",
    output: allNodes,
    notes: notes.length > 0 ? notes : undefined,
    reviewSignals: allReviewSignals,
    metrics,
  };
}
