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
 *
 * Phase 2F.2 §12/§13 added 5 members (GUARANTEE_OBLIGATION, SECURITY_GRANT,
 * WAIVER, LIABILITY_CAP, REPRESENTATION) after real Document B evidence (a
 * guarantee-and-collateral agreement) showed these are materially distinct,
 * reusable operative-role concepts common to guarantee/security agreements
 * as a document TYPE - not representable by any existing member, and not a
 * CONMED-specific wording variant (see normalization.ts's own rule
 * comments for the generalized rationale behind each).
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
  | "OTHER_RELEVANT_RULE"
  | "GUARANTEE_OBLIGATION"
  | "SECURITY_GRANT"
  | "WAIVER"
  | "LIABILITY_CAP"
  | "REPRESENTATION";

/** Runtime array form of DiscoveryRole, co-located with the type (not in pass-b-semantic.ts/normalization.ts) so both of those modules can import it without an import cycle between them. pass-b-semantic.ts re-exports this for backward-compatible import paths. */
export const DISCOVERY_ROLES = [
  "GENERAL_PROHIBITION",
  "PERMISSION",
  "BASKET",
  "EXCEPTION",
  "RATIO_BASED_PERMISSION",
  "BUILDER",
  "CONDITION",
  "PROVISO",
  "FINANCIAL_TEST",
  "SHARED_CAP",
  "REFINANCING_PERMISSION",
  "DESIGNATION_RULE",
  "TRIGGER",
  "CURE",
  "DEFINITIONAL_DEPENDENCY_CANDIDATE",
  "OTHER_RELEVANT_RULE",
  "GUARANTEE_OBLIGATION",
  "SECURITY_GRANT",
  "WAIVER",
  "LIABILITY_CAP",
  "REPRESENTATION",
] as const satisfies readonly DiscoveryRole[];

export type DiscoveryMethod = "DETERMINISTIC_SIGNAL" | "SEMANTIC_CLASSIFICATION" | "NEIGHBORHOOD_EXPANSION";

export type DiscoveryReviewStatus = "AUTO_ACCEPTED" | "NEEDS_REVIEW" | "UNCERTAIN";

/** Pass A's own output before semantic classification - deliberately over-inclusive (task §2/§8 Pass A). */
export interface DeterministicCandidate {
  documentId: string;
  /** @deprecated legacy label-shaped key, kept for backward-compatible display/logging only. Use `nodeId` for identity. */
  nodeKey: string;
  /** Phase 3F.1.2 - the real physical occurrence identity backing this candidate. */
  nodeId: string;
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
  /** @deprecated legacy label-shaped keys, kept for backward-compatible display/logging only. Use `structuralNodeIds` for identity. One or more structural nodes this discovery's evidence spans - more than one only after Pass C neighborhood expansion links a genuinely related node (e.g. a prohibition + the exception that makes it operative). */
  structuralNodeKeys: string[];
  /** Phase 3F.1.2 - occurrence-safe counterpart of structuralNodeKeys, same order/length. */
  structuralNodeIds: string[];
  normalizedSourceRef: string;
  families: CovenantFamily[];
  otherFamilyDescription?: string;
  role: DiscoveryRole;
  /** Phase 2F.2 §7/§9 provenance - the exact raw string the model returned for `role` before normalization, and how confidently normalization.ts mapped it to `role` above. Always populated (even for an exact-enum VALID_CANONICAL match) so no candidate's normalization history is ever silently lost. */
  roleRaw: string;
  roleNormalizationStatus: import("./normalization").NormalizationStatus;
  /** Same provenance for `families`, aggregated across every raw family string the model returned for this candidate. */
  familiesRaw: string[];
  familiesNormalizationStatus: import("./normalization").NormalizationStatus;
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

/**
 * Phase 2F.2 §18 - document-level discovery health, analogous to (but
 * independent of) structural-coverage.ts's own StructuralHealthState.
 * Consumed by package-safety.ts alongside structural health so the
 * package-safety layer reflects a partially- or fully-failed Pass B run,
 * not only a structurally-unparseable document.
 */
export type DiscoveryHealthState = "DISCOVERY_HEALTHY" | "DISCOVERY_PARTIAL" | "DISCOVERY_FAILED";

/** Phase 2F.2 §8/§10 - one section-level Pass B call that failed outright (network error, non-schema exception, or an unrecoverable parse failure) and was NOT allowed to abort the rest of the document (see pipeline.ts's per-section try/catch). Never silently dropped - every failure here is surfaced in DiscoveryRunSummary.sectionFailures. */
export interface DiscoverySectionFailure {
  sectionNodeKey: string;
  sectionRef: string;
  stage: "PASS_B_SEMANTIC_CLASSIFICATION";
  errorMessage: string;
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
  /** Phase 2F.2 §8/§10/§18 - sections whose Pass B call failed and was isolated rather than aborting the document, plus the resulting document-level health verdict. */
  sectionsAttempted: number;
  sectionFailures: DiscoverySectionFailure[];
  documentDiscoveryHealth: DiscoveryHealthState;
}
