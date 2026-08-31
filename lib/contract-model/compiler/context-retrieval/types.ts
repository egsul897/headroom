/**
 * Phase 2D - Recursive Cross-Document Covenant Context Retrieval V1
 * (docs/phase-2d-covenant-context-retrieval.md).
 *
 * Standalone, in-memory pipeline - same precedent as Phase 2B's discovery
 * pipeline and Phase 2C's package-graph pipeline (neither is wired into
 * ContractCompilerRun's persisted stage machine either). This phase's own
 * audit (see the final report §3-6) found no clean existing persistence
 * home for a Covenant Context Bundle: UnresolvedContractItem requires an
 * already-persisted ContractRule/DefinedTermNode/ContractReferenceEdge row,
 * but this phase's input is a Phase 2B DiscoveredCandidate, which is
 * deliberately NOT a ContractRule (RULE_EXTRACTION's own, later, more
 * precise concept) - forcing that dependency here would conflate two
 * stages Phase 2B's own design kept separate. Persistence/invalidation/
 * idempotency are instead demonstrated through deterministic content-hash
 * identity over a pure function (see identity.ts), exactly the same
 * "real, testable, hash-keyed, but not yet a DB table" discipline Phase 2B
 * used for computeDiscoveryInputHash.
 */
import type { CovenantFamily } from "@prisma/client";
import type { DiscoveredCandidate } from "../discovery/types";
import type { NodeSupersessionStatus } from "../amendment/types";
import type { DefinitionEvidenceStatus } from "../amendment/operative-state";

export type ContextItemType =
  | "OPERATIVE_SOURCE"
  | "PARENT_SCOPE"
  | "CHILD_RULE"
  | "SIBLING_CONTEXT"
  | "PROVISO"
  | "EXCEPTION"
  | "CONDITION"
  | "SHARED_CAP"
  | "DEFINITION"
  | "DEFINITION_DEPENDENCY"
  | "CALCULATION_PROVISION"
  | "ENTITY_SCOPE"
  | "CROSS_REFERENCE"
  | "CROSS_DOCUMENT_REFERENCE"
  | "AMENDMENT_LEAD"
  | "SUPPLEMENT_LEAD"
  | "INTERCREDITOR_LEAD"
  | "RELATED_COVENANT"
  | "OTHER_REQUIRED_CONTEXT"
  /**
   * Phase 3F.1.4 (CTX-02 remediation, WRONG-CONTEXT CONTAMINATION fix) - a
   * sibling under the same structural parent whose OWN text matched one of
   * the generic PROVISO/EXCEPTION/CONDITION/SHARED_CAP keyword signals, but
   * for which retrieveSiblingContext (structural-context.ts) could NOT
   * establish any real evidence that the sibling's language actually
   * concerns the same subject/economic mechanism as the specific candidate
   * it would otherwise be attached to (no clause backreference, no shared
   * named defined term/dollar figure, no section-wide scope phrase, no
   * bare-qualifier grammatical continuation of the candidate's own
   * enumerated list). Deliberately a DIFFERENT type (never PROVISO/
   * EXCEPTION/CONDITION/SHARED_CAP) and always confidence <= 0.3, so a
   * downstream consumer can never mistake this for a genuinely-verified
   * relevant item merely by reading `type`/`confidence` - the audit's own
   * finding was that the false and the true item were otherwise byte-
   * identical in shape. Never silently dropped (recall is preserved - the
   * sibling is still disclosed, just honestly flagged), and never silently
   * promoted to normal confidence.
   */
  | "UNVERIFIED_SIBLING_SIGNAL";

export type RetrievalMethod = "STRUCTURAL_TRAVERSAL" | "DEFINITION_INDEX" | "CROSS_REFERENCE_INDEX" | "PACKAGE_GRAPH" | "SEMANTIC_RELEVANCE";

/**
 * Phase 3F.1 FIX-2 ("trust metadata belongs to the evidence itself, not to
 * the retrieval mechanism") - reuses amendment/operative-state.ts's own
 * DefinitionEvidenceStatus vocabulary VERBATIM (never a second, parallel
 * enum) so a context-bundle item's own trust state is expressed in exactly
 * the same terms as the semantic compiler's evidence tools already use
 * (semantic/tools.ts's ToolExecutionOutcome.evidenceUnresolved,
 * resolveOperativeDefinitionEvidence/resolveOperativeSectionEvidence). This
 * is attached to an item at CONSTRUCTION time (context-retrieval/state.ts's
 * own resolveSectionEvidenceState/resolveDefinitionEvidenceState helpers),
 * BEFORE the item is ever placed in a bundle or handed to a model - the
 * whole point of this fix is that this state does not depend on, and is
 * available whether or not, the model ever calls any evidence tool.
 */
export interface ContextItemEvidenceState {
  /** CURRENT/KNOWN_SUPERSEDED/OPERATIVE_STATE_UNRESOLVED/AMBIGUOUS_TARGET/PARTIAL_AMENDMENT/HISTORICAL_ONLY - see DefinitionEvidenceStatus's own header comment for the full 6-value taxonomy. */
  status: DefinitionEvidenceStatus;
  /** True iff status === "CURRENT" - the single field a caller should gate on, mirroring DefinitionEvidenceFound.isCurrentTruth. */
  isCurrentTruth: boolean;
  /** Human-readable reason, always populated (never blank) - surfaced to the model verbatim by summarizeContextBundle. */
  reason: string;
}

/** One retrieved piece of contractual evidence, with an explicit reason it is here (task §6/§27 - "why is this here, and where did it come from"). */
export interface ContextItem {
  /** Deterministic, content-derived (documentId + normalizedRef + type) - stable across rebuilds, never derived from array position (task §31). */
  itemId: string;
  type: ContextItemType;
  documentId: string;
  /** @deprecated legacy label-shaped key, kept for backward-compatible display/logging only. Use `structuralNodeId` for identity. Null only for a definition whose full-text span is not itself a StructuralNode (definitions live in prose, not the lettered-clause tree Phase 2A parses). */
  structuralNodeKey: string | null;
  /** Phase 3F.1.2 - the real physical occurrence identity for this item (null iff structuralNodeKey is null). */
  structuralNodeId: string | null;
  /** sectionRef for a structural item, or the exact defined term name for a definition/definition-dependency item. */
  normalizedRef: string;
  sourceCitation: string;
  /** Bounded excerpt - the full text where it fits the item budget, truncated with an explicit marker otherwise (task §5 - "do not store huge duplicated raw-text blobs unnecessarily"). */
  excerptText: string;
  reason: string;
  retrievalDepth: number;
  /** Chain of itemIds that led to this item being retrieved, root first. */
  retrievalPath: string[];
  retrievalMethod: RetrievalMethod;
  confidence: number | null;
  /**
   * Phase 3F.1 FIX-2 - optional (mirrors ToolCallLogEntry.evidenceUnresolved's
   * own established convention in this codebase), so an item constructed by
   * pre-existing code/test fixtures that predates this fix remains valid
   * (undefined = "operative-state trust was never computed for this item" -
   * treated identically to null by every real consumer below, never upgraded
   * to a false CURRENT claim by omission). Every REAL context-retrieval call
   * site added by this fix DOES populate a real value: null ONLY for an item
   * type that never carries an independently-interpretable operative-truth
   * claim at all (a topology/graph-metadata item, or a lead explicitly
   * requiring further amendment resolution before ANY trust claim would even
   * be meaningful - see this phase's own §16 audit table in
   * docs/phase-3f1-final-closure/04-evidence-trust-context-fix.json for the
   * exact per-type classification); a real, non-null ContextItemEvidenceState
   * for every SECTION-kind or DEFINITION-kind item that carries real
   * provision/economic excerptText.
   */
  evidenceState?: ContextItemEvidenceState | null;
}

export type DependencyEdgeType = "PARENT_OF" | "CHILD_OF" | "SIBLING_OF" | "DEFINES" | "DEPENDS_ON_DEFINITION" | "REFERENCES" | "CROSS_DOCUMENT_LEAD" | "AMENDMENT_CANDIDATE";

export interface DependencyEdge {
  fromItemId: string;
  toItemId: string;
  edgeType: DependencyEdgeType;
  reason: string;
}

export type UnresolvedDependencyType =
  | "UNRESOLVED_DEFINED_TERM"
  | "AMBIGUOUS_RELATIVE_REFERENCE"
  | "MISSING_SCHEDULE"
  | "REFERENCED_DOCUMENT_ABSENT"
  | "AMBIGUOUS_AMENDMENT_TARGET"
  | "DEFINITION_CYCLE"
  | "REFERENCE_CYCLE"
  | "BUDGET_EXCEEDED_DEPENDENCY"
  /**
   * Phase 3F.1.6.RX Workstream B (BLOCKER-2 real-consumer remediation) -
   * this bundle's own originating DiscoveredCandidate (input.candidate) is
   * itself KNOWN_SUPERSEDED per discovery/pass-d-reconcile.ts's own
   * worst-case-across-structuralNodeIds computation. Root cause this
   * closes: `DiscoveredCandidate.supersessionStatus` (added by BLOCKER-2's
   * own fix) was computed correctly at the discovery layer but never read
   * by ANY of this field's own 3 named real consumers (context-retrieval,
   * coverage-audit's discovery-comparison.ts, semantic-coverage's
   * reconciliation.ts) - an independent runtime trace found the type
   * existed but nothing downstream ever branched on it, the exact
   * "architecturally inert" failure shape BLOCKER-2 itself was created to
   * close for DeterministicCandidate. This is a DIFFERENT, more severe
   * dependency type than the others above (all of which describe an
   * inability to RESOLVE a reference/term) - here resolution succeeded,
   * but the resolved text's own governing status is affirmatively known to
   * be stale, which is why it is always HIGH severity (see
   * buildCovenantContextBundle's own use of this).
   */
  | "SUPERSEDED_OPERATIVE_SOURCE"
  | "OTHER";

export type UnresolvedSeverity = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface UnresolvedDependency {
  originatingNodeKey: string | null;
  dependencyType: UnresolvedDependencyType;
  sourceText: string;
  attemptedResolution: string;
  reason: string;
  candidateTargets: string[];
  citation: string;
  severity: UnresolvedSeverity;
}

export type SufficiencyState = "SUFFICIENT" | "REVIEW_REQUIRED" | "INCOMPLETE" | "BUDGET_EXCEEDED";

export interface RetrievalBudget {
  maxDefinitionDepth: number;
  maxCrossReferenceDepth: number;
  maxItems: number;
  maxTextBudgetChars: number;
}

export const DEFAULT_RETRIEVAL_BUDGET: RetrievalBudget = {
  maxDefinitionDepth: 5,
  maxCrossReferenceDepth: 3,
  maxItems: 60,
  maxTextBudgetChars: 40_000,
};

export interface ContextRetrievalPerformance {
  itemsConsidered: number;
  itemsRetained: number;
  duplicatePathsDeduplicated: number;
  maxDefinitionDepthReached: number;
  maxCrossReferenceDepthReached: number;
  crossReferenceTraversals: number;
  crossDocumentLeads: number;
  deterministicWallClockMs: number;
  semanticWallClockMs: number;
  semanticCalls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Bumped to v2 by Phase 2E.1's cross-reference/structural-region boundary
 * remediation (docs/phase-2e-1-cross-reference-remediation.md):
 * generalized relative-clause resolution (ancestor self-match, antecedent
 * Section override, ancestor-chain child search - structural-references.ts)
 * and bounded referenced-region expansion (region-expansion.ts) replace
 * v1's direct-parent-only relative resolution and OWN-text-only child/
 * cross-reference-target retrieval. Any bundle built under v1 must be
 * treated as stale and recomputed, never resumed as-is (task §18).
 *
 * Bumped to v3 by Phase 3F.1 FIX-2 (trust-metadata-belongs-to-the-evidence-
 * itself remediation): every DEFINITION/SECTION-shaped item now carries a
 * real evidenceState (see ContextItem's own doc comment), and the bundle
 * itself now discloses hasUnresolvedOperativeEvidence/
 * unresolvedEvidenceItemIds. A bundle built under v2 or earlier carries no
 * such trust metadata at all and must be treated as stale/recomputed - never
 * resumed as-is, since compile.ts's own inputHasUnresolvedOperativeEvidence
 * gate depends on it.
 */
export const RETRIEVAL_ALGORITHM_VERSION = "phase-2d-context-retrieval.v3";

export interface CovenantContextBundle {
  /** Deterministic, content-derived (never random) - see identity.ts. */
  bundleId: string;
  packageKey: string;
  companyId: string;
  instrumentKey: string | null;
  originatingDocumentId: string;
  originatingDiscoveryId: string;
  /** @deprecated legacy label-shaped keys, kept for backward-compatible display/logging only. Use `originatingStructuralNodeIds` for identity. */
  originatingStructuralNodeKeys: string[];
  /** Phase 3F.1.2 - occurrence-safe counterpart of originatingStructuralNodeKeys. */
  originatingStructuralNodeIds: string[];
  normalizedSourceRef: string;
  originatingFamilies: CovenantFamily[];
  /**
   * Phase 3F.1.6.RX Workstream B (BLOCKER-2 real-consumer remediation) -
   * copied directly off the SAME `DiscoveredCandidate.supersessionStatus`/
   * `supersessionReason` Pass D already computed (never re-derived here -
   * this module has no amendment/* import and none is added by this fix).
   * Always populated, defaulting to whatever the input candidate itself
   * carries (UNKNOWN_SUPERSESSION_STATUS whenever discovery itself had no
   * real supersessionIndex - never CURRENT_OPERATIVE by omission). See
   * buildCovenantContextBundle's own header for what this bundle's
   * sufficiencyState does with a KNOWN_SUPERSEDED value.
   */
  originatingSupersessionStatus: NodeSupersessionStatus;
  originatingSupersessionReason: string;

  items: ContextItem[];
  edges: DependencyEdge[];
  unresolvedDependencies: UnresolvedDependency[];

  retrievalAlgorithmVersion: string;
  semanticPromptVersion: string | null;
  providerIdentity: string | null;
  /** Hash of every input this bundle's content actually depends on - the cache/invalidation identity (task §29/§31). Two builds with an unchanged contentIdentity are guaranteed to produce byte-identical items/edges/unresolvedDependencies. */
  contentIdentity: string;

  sufficiencyState: SufficiencyState;
  stopReasons: string[];

  performance: ContextRetrievalPerformance;

  /**
   * Phase 3F.1 FIX-2 (§4 of the governing fix spec) - a structured value
   * computed from the bundle's OWN items, independent of whether the model
   * ever calls any evidence tool: true iff at least one item in `items`
   * carries a non-null `evidenceState` with `isCurrentTruth === false`.
   * semantic/compile.ts's own failureReasons wiring and
   * semantic-verification/verify.ts's own determineStatus both read this
   * (never re-scan `items` independently, so there is exactly one place
   * this decision is made) so a compilation whose toolCallLog is completely
   * EMPTY can still never be silently blessed COMPLETED/VERIFIED off a
   * bundle that itself embedded stale/conflicted/ambiguous/superseded
   * evidence.
   */
  /** Optional for the same backward-compatibility reason as ContextItem.evidenceState above - undefined only for a bundle built by pre-existing code/fixtures that predates this fix; every real buildCovenantContextBundle call always sets a real boolean. Consumers (compile.ts/verify.ts) treat undefined identically to false - never upgraded to a false "resolved" claim by omission. */
  hasUnresolvedOperativeEvidence?: boolean;
  /** itemIds of every item that set hasUnresolvedOperativeEvidence above - bounded provenance, never a silent boolean alone. */
  unresolvedEvidenceItemIds?: string[];
}

export interface BuildContextBundleInput {
  candidate: DiscoveredCandidate;
  packageKey: string;
  companyId: string;
  instrumentKey: string | null;
  budget?: RetrievalBudget;
}
