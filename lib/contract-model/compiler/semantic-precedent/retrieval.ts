/**
 * Phase 3D - Stage 1 candidate generation (task §14's "two-stage retrieval:
 * Stage 1 candidate generation (broad/high-recall), Stage 2 applicability
 * ranking"). This module ONLY produces a broad, generously-scored candidate
 * list from SemanticSignature overlap - it never decides APPLICABLE vs
 * NOT_APPLICABLE (that is Stage 2 / applicability.ts, task #140's own
 * module, kept separate per task §3's "never collapse Retrieval Match
 * determination into candidate generation").
 *
 * Deliberately NO embeddings/vector-DB (task §14's own "don't add heavy
 * vector-DB infra without justification") - candidate volume in V1 is a
 * handful of reviewed precedent per tenant/system library, so an O(n)
 * signature-overlap scan over an in-memory list is the justified, simplest
 * choice; nothing here prevents swapping in an ANN index later behind the
 * same generateCandidates() signature if the library grows large.
 *
 * No company/package/section-specific logic anywhere in this file
 * (Architecture Invariant #29) - scoring only ever compares SemanticSignature
 * fields, which by construction (signature.ts) never carry identity.
 */
import type { GeneralizedPrecedent, SemanticSignature } from "./types";

export const SEMANTIC_PRECEDENT_RETRIEVAL_ALGORITHM_VERSION = "phase-3d-precedent-retrieval.v1";

export interface RetrievalCandidate {
  precedent: GeneralizedPrecedent;
  candidateScore: number;
  matchedDimensions: string[];
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * A single dimension's contribution to the broad Stage 1 score. Every
 * comparison is symmetric and generic - none of these functions know what
 * "action" or "posture" values mean, only whether two signatures agree.
 * Exported so applicability.ts (Stage 2) can reuse the identical, single-
 * sourced comparison for its own negative-precedent contrast check, rather
 * than maintaining a second scoring function that could silently drift from
 * this one.
 */
export function scoreSignatureOverlap(query: SemanticSignature, candidate: SemanticSignature): { score: number; matched: string[] } {
  const matched: string[] = [];
  let score = 0;

  if (query.action !== null && query.action === candidate.action) {
    score += 1;
    matched.push("ACTION");
  }
  if (query.posture !== null && query.posture === candidate.posture) {
    score += 1;
    matched.push("POSTURE");
  }
  if (query.ruleType !== null && query.ruleType === candidate.ruleType) {
    score += 0.5;
    matched.push("RULE_TYPE");
  }
  if (query.covenantFamily !== null && query.covenantFamily === candidate.covenantFamily) {
    score += 0.5;
    matched.push("COVENANT_FAMILY");
  }
  if (query.topLevelOperator !== null && query.topLevelOperator === candidate.topLevelOperator) {
    score += 1;
    matched.push("TOP_LEVEL_OPERATOR");
  }

  const operatorOverlap = jaccard(query.operatorSet, candidate.operatorSet);
  if (operatorOverlap > 0) {
    score += operatorOverlap * 1.5;
    matched.push("OPERATOR_SET");
  }

  const conditionOverlap = jaccard(query.conditionTypes, candidate.conditionTypes);
  if (conditionOverlap > 0) {
    score += conditionOverlap;
    matched.push("CONDITION_TYPES");
  }

  const entityScopeOverlap = jaccard(query.entityScopeTags, candidate.entityScopeTags);
  if (entityScopeOverlap > 0) {
    score += entityScopeOverlap * 0.5;
    matched.push("ENTITY_SCOPE");
  }

  const dependencyOverlap = jaccard(query.dependencyRelationshipTypes, candidate.dependencyRelationshipTypes);
  if (dependencyOverlap > 0) {
    score += dependencyOverlap * 0.5;
    matched.push("DEPENDENCY_RELATIONSHIP_TYPES");
  }

  for (const [flag, label] of [
    ["hasRatioGate", "RATIO_GATE"],
    ["hasScheduledThreshold", "SCHEDULED_THRESHOLD"],
    ["hasEventActiveStepUp", "EVENT_ACTIVE_STEP_UP"],
    ["hasExceptions", "EXCEPTIONS"],
    ["hasSharedCapacity", "SHARED_CAPACITY"],
    ["hasReclassificationDependency", "RECLASSIFICATION_DEPENDENCY"],
  ] as const) {
    if (query[flag] && candidate[flag]) {
      score += 0.5;
      matched.push(label);
    }
  }

  return { score, matched };
}

export interface GenerateCandidatesOptions {
  /** Stage 1 is deliberately generous (high recall) - a low floor keeps weak-but-not-zero matches in play for Stage 2 to judge, rather than silently dropping them here (task §14's own "candidate generation broad/high-recall"). */
  minScore?: number;
  maxCandidates?: number;
}

/**
 * Stage 1: broad candidate generation. Only ever consults `precedents` (the
 * caller is responsible for having already filtered by tenancy/review-status/
 * package-exclusion via the store's own filters - task §57's leave-one-
 * package-out mechanism lives in store.ts, not here, so this function never
 * needs to know what a "package" is).
 */
export function generateCandidates(querySignature: SemanticSignature, precedents: GeneralizedPrecedent[], options: GenerateCandidatesOptions = {}): RetrievalCandidate[] {
  const minScore = options.minScore ?? 0.5;
  const results: RetrievalCandidate[] = [];

  for (const precedent of precedents) {
    if (precedent.isNegativePrecedent) continue; // negative precedent is surfaced by applicability.ts (Stage 2) as an explicit contrast, never as a positive candidate here.
    const { score, matched } = scoreSignatureOverlap(querySignature, precedent.signature);
    if (score >= minScore) results.push({ precedent, candidateScore: score, matchedDimensions: matched });
  }

  results.sort((a, b) => b.candidateScore - a.candidateScore);
  return options.maxCandidates ? results.slice(0, options.maxCandidates) : results;
}
