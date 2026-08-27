/**
 * Phase 2B - autonomous covenant discovery output schema (task §10).
 *
 * Family and operative role are kept as two INDEPENDENT dimensions (task
 * §7): `families` reuses the real, closed CovenantFamily Prisma enum
 * (already the correct "what does this concern" vocabulary, unchanged
 * since Phase B) - `family: null` + `otherFamilyDescription` is the honest
 * fallback for a provision that genuinely does not fit any existing family,
 * rather than forcing one or inventing a fake enum member (no migration).
 * `role` is a NEW, discovery-layer-only bounded union: no single existing
 * enum cleanly separates "basket" from "builder" from "shared cap" the way
 * this phase's own task explicitly asks for, and RULE_EXTRACTION's own
 * ContractRuleType remains the authoritative, more precise role assigned
 * once a rule is actually extracted - this is a coarser, upstream guess
 * feeding that later, more precise classification, not a replacement for it.
 */
import type { CovenantFamily } from "@prisma/client";

export type DiscoveryRole =
  | "GENERAL_PROHIBITION"
  | "PERMISSION"
  | "BASKET"
  | "EXCEPTION"
  | "RATIO_BASED_PERMISSION"
  | "BUILDER"
  | "CONDITION"
  | "PROVISO"
  | "FINANCIAL_TEST"
  | "SHARED_CAP"
  | "REFINANCING_PERMISSION"
  | "DESIGNATION_RULE"
  | "TRIGGER"
  | "CURE"
  | "DEFINITIONAL_DEPENDENCY_CANDIDATE"
  | "OTHER_RELEVANT_RULE";

export type DiscoveryMethod = "DETERMINISTIC_SIGNAL" | "SEMANTIC_CLASSIFICATION" | "NEIGHBORHOOD_EXPANSION";

export type DiscoveryReviewStatus = "AUTO_ACCEPTED" | "NEEDS_REVIEW" | "UNCERTAIN";

/** Pass A's own output before semantic classification - deliberately over-inclusive (task §2/§8 Pass A). */
export interface DeterministicCandidate {
  documentId: string;
  nodeKey: string;
  sectionRef: string;
  /** Which cheap signals fired on this node's own text - the evidence trail for why Pass A selected it, never the final semantic decision. */
  signals: string[];
  signalScore: number;
}

/** The final discovered item (task §10's required minimum field set). */
export interface DiscoveredCandidate {
  /** Deterministic, content-derived (never random) - stable across reruns of the identical algorithm version over identical content. */
  discoveryId: string;
  documentId: string;
  /** One or more structural nodes this discovery's evidence spans - more than one only after Pass C neighborhood expansion links a genuinely related node (e.g. a prohibition + the exception that makes it operative). */
  structuralNodeKeys: string[];
  normalizedSourceRef: string;
  families: CovenantFamily[];
  otherFamilyDescription?: string;
  role: DiscoveryRole;
  description: string;
  /** True when this single structural node likely bundles multiple independently operative rules the structural parser could not safely separate (task §5) - never silently treated as one rule. */
  multipleRulesLikely: boolean;
  definedTermDependencyLikely: boolean;
  discoveryMethods: DiscoveryMethod[];
  evidenceSignals: string[];
  reviewStatus: DiscoveryReviewStatus;
  confidence: number | null;
  sourceCitation: string;
  /** The exact algorithm/prompt/schema version this candidate was produced under - the cache-invalidation identity (task §9). */
  discoveryRunVersion: string;
}

export interface DiscoveryRunSummary {
  documentId: string;
  nodesInspected: number;
  deterministicCandidatesGenerated: number;
  semanticCandidatesEvaluated: number;
  duplicatesBeforeReconciliation: number;
  finalCandidateCount: number;
  wallClockMs: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
}
