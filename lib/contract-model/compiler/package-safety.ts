/**
 * Phase 2F.1 §8/§14/§15 - package-level structural-safety propagation.
 *
 * A pure aggregator, not a new pipeline stage: it reads structural-
 * coverage.ts's own per-document health (itself derived only from Phase
 * 2A's node list - task §8's "explicit upstream uncertainty/error"
 * signal) alongside Phase 2B's own discovery candidate count and Phase
 * 2C's own document classification, and rolls them into one package-
 * level safety verdict. It never mutates or gates Phase 2B/2D
 * themselves (task §8's own "do not necessarily block processing of
 * other healthy documents") - a caller consults this alongside the
 * primary pipeline's own output, the same way a caller already consults
 * Phase 2E's findings alongside Phase 2B/2D's own conclusions.
 *
 * Amendment detection for §15 deliberately does NOT rely solely on
 * Phase 2C's own DocumentType classification, because Phase 2F's own
 * dedicated diagnosis found that classifier can be wrong for exactly
 * this kind of document (the real Second Amendment and Omnibus
 * Amendment were both misclassified as base-agreement types) - a defect
 * this task explicitly does not fix. Corroborating with an independent
 * raw-text amendment-signal scan (signals.ts's own AMENDMENT category)
 * means this safety check still works correctly even while that
 * separate, known Phase 2C defect remains open.
 */
import { detectAmendmentAndDefinitionalSignals } from "./coverage-audit/signals";
import type { StructuralCoverageResult } from "./structural-coverage";
import type { DiscoveryHealthState } from "./discovery/types";
import type { RelationshipCandidate } from "./package-graph/types";
import type { AmendmentEffectCandidate, OperativeContractState } from "./amendment/types";

const AMENDMENT_DOCUMENT_TYPES = new Set(["AMENDMENT", "AMENDED_AND_RESTATED_AGREEMENT", "SUPPLEMENTAL_INDENTURE", "JOINDER"]);

export type PackageSafetyState = "PACKAGE_SAFE" | "PACKAGE_REVIEW_REQUIRED" | "PACKAGE_UNSAFE";

export interface DocumentSafetyEntry {
  documentId: string;
  structuralHealth: StructuralCoverageResult["health"];
  coveragePercent: number;
  discoveryCandidateCount: number;
  /** True when Phase 2A's own structural health is not good enough to trust an absence of findings for this document (task §8's own "STRUCTURAL_INPUT_INSUFFICIENT or equivalent"). */
  structuralInputInsufficient: boolean;
  /** Corroborated from Phase 2C's own classification OR an independent raw-text amendment-signal scan (see module header) - true if either source suggests this document is an amendment/restatement/supplement/joinder. */
  likelyAmendment: boolean;
  /** Task §15's own exact signal name - true only when likelyAmendment AND structuralInputInsufficient both hold. */
  potentiallyRelevantAmendmentNotFullyAnalyzed: boolean;
  /** Phase 2F.2 §18 - Pass B semantic-discovery health for this document, independent of structural health: a document can be STRUCTURE_HEALTHY yet DISCOVERY_PARTIAL/FAILED if one or more section-level Pass B calls failed and were isolated rather than aborting the whole document. Defaults to DISCOVERY_HEALTHY when the caller does not supply discovery health (keeps this an additive, non-breaking extension of the Phase 2F.1 shape). */
  discoveryHealth: DiscoveryHealthState;
  /** True when discoveryHealth is not DISCOVERY_HEALTHY - the discovery-side analogue of structuralInputInsufficient. */
  discoveryInputInsufficient: boolean;
}

export interface PackageSafetyResult {
  packageKey: string;
  documents: DocumentSafetyEntry[];
  state: PackageSafetyState;
  reasons: string[];
  /** Task §14's own example phrasing, computed exactly: "N of M documents were not structurally analyzed successfully." */
  summarySentence: string;
  /** Phase 2F.3 §21 - package-graph relationship-resolution safety, additive to the structural/discovery checks above. Never null - defaults to empty when the caller does not supply relationshipCandidates (a Phase 2F.1/2F.2-only caller keeps working unchanged). */
  unresolvedMaterialRelationshipCount: number;
  reviewRequiredRelationshipCount: number;
  /** Phase 2G §23 - operative-contract-state sufficiency, additive. Counts instruments (not individual provisions) whose computed OperativeContractState carries the given status - never null, defaults to zero when the caller does not supply operativeStates (a pre-2G caller keeps working unchanged). */
  conflictedInstrumentCount: number;
  operativeReviewRequiredInstrumentCount: number;
  /** Phase 2G §17/§30, additive - amendment effects that resolve to a whole DOCUMENT (never a section/definition), so they can never attach to any per-provision OperativeContractState and would otherwise be invisible to operativeReviewRequiredInstrumentCount above (e.g. a marked/conformed-exhibit or schedule-modification amendment - see amendment/markup-exhibit.ts and amendment/schedule-modification.ts). Counted here so a real, material, unresolved whole-document amendment can never silently leave a package looking PACKAGE_SAFE. Never null - defaults to zero when the caller does not supply unattachedAmendmentEffects. */
  unresolvedWholeDocumentAmendmentCount: number;
}

export interface DocumentSafetyInput {
  documentId: string;
  documentText: string;
  coverage: StructuralCoverageResult;
  discoveryCandidateCount: number;
  declaredDocumentType?: string | null;
  /** Phase 2F.2 §18 - optional so existing Phase 2F.1 callers that do not yet run discovery keep working unchanged; defaults to DISCOVERY_HEALTHY (never assumed FAILED merely because a caller omitted it). */
  discoveryHealth?: DiscoveryHealthState;
}

/**
 * Phase 2F.3 §21 - "a confidently false relationship is dangerous; package
 * safety should downgrade if a material target relationship is
 * unresolved, conflicting strong evidence exists, a related base document
 * is missing, or an amendment target cannot be established." Every
 * relationship candidate this module's own relationship-resolution.ts
 * produces already IS a "material" one (task §9's own module-header
 * rationale: package-proximity-only RELATED_TO edges are deliberately
 * never generated in the first place, so there is no separate "weak
 * edge" category to filter out here) - UNRESOLVED means exactly the
 * §21-named failure modes (ambiguous target, missing base document,
 * amendment target not established), never a merely-uninteresting edge.
 * REVIEW_REQUIRED (a real candidate found, but only by a weaker type-only
 * match) is tracked separately and reported, but does not by itself
 * downgrade the package state - a package with review-required
 * relationships is still safely, partially analyzable (task §21's own
 * "do not force all-or-nothing failure"), whereas an outright unresolved
 * material relationship is not.
 */
function computeRelationshipSafety(relationshipCandidates: RelationshipCandidate[] | undefined): { unresolvedMaterialRelationshipCount: number; reviewRequiredRelationshipCount: number; unresolvedDocumentIds: string[] } {
  const candidates = relationshipCandidates ?? [];
  const unresolved = candidates.filter((r) => r.status === "UNRESOLVED");
  const reviewRequired = candidates.filter((r) => r.status === "REVIEW_REQUIRED");
  return {
    unresolvedMaterialRelationshipCount: unresolved.length,
    reviewRequiredRelationshipCount: reviewRequired.length,
    unresolvedDocumentIds: [...new Set(unresolved.map((r) => r.sourceDocumentId))],
  };
}

/**
 * Phase 2G §23 - "a future semantic compiler must not receive a
 * supposedly authoritative current covenant if the underlying amendment
 * chain is unresolved." CONFLICTED and REVIEW_REQUIRED instrument-level
 * operative states both downgrade package safety to PACKAGE_REVIEW_REQUIRED
 * - never PACKAGE_UNSAFE - because both are, by this module's own
 * construction, surfaced uncertainty rather than a confidently false
 * result (the whole point of the OperativeStateStatus taxonomy is that a
 * genuinely unresolved amendment chain is never silently reported as
 * OPERATIVE_STATE_RESOLVED). PARTIAL (identity known, exact text not
 * safely renderable) is reported but does not by itself downgrade the
 * package - the future compiler can still know WHICH document/effect
 * governs even without the verbatim resulting text.
 */
function computeOperativeStateSafety(operativeStates: OperativeContractState[] | undefined): { conflictedInstrumentCount: number; reviewRequiredInstrumentCount: number; conflictedInstrumentKeys: string[]; reviewRequiredInstrumentKeys: string[] } {
  const states = operativeStates ?? [];
  const conflicted = states.filter((s) => s.status === "OPERATIVE_STATE_CONFLICTED");
  const reviewRequired = states.filter((s) => s.status === "OPERATIVE_STATE_REVIEW_REQUIRED");
  return {
    conflictedInstrumentCount: conflicted.length,
    reviewRequiredInstrumentCount: reviewRequired.length,
    conflictedInstrumentKeys: conflicted.map((s) => s.instrumentKey),
    reviewRequiredInstrumentKeys: reviewRequired.map((s) => s.instrumentKey),
  };
}

export function computePackageSafety(
  packageKey: string,
  inputs: DocumentSafetyInput[],
  relationshipCandidates?: RelationshipCandidate[],
  operativeStates?: OperativeContractState[],
  unattachedAmendmentEffects?: AmendmentEffectCandidate[]
): PackageSafetyResult {
  const documents: DocumentSafetyEntry[] = inputs.map((d) => {
    const structuralInputInsufficient = d.coverage.health === "STRUCTURE_FAILED" || d.coverage.health === "STRUCTURE_INSUFFICIENT";
    const classifiedAsAmendment = d.declaredDocumentType != null && AMENDMENT_DOCUMENT_TYPES.has(d.declaredDocumentType);
    const rawAmendmentSignal = detectAmendmentAndDefinitionalSignals(d.documentText.slice(0, 4000)).some((s) => s.category === "AMENDMENT");
    const likelyAmendment = classifiedAsAmendment || rawAmendmentSignal;
    const discoveryHealth = d.discoveryHealth ?? "DISCOVERY_HEALTHY";
    return {
      documentId: d.documentId,
      structuralHealth: d.coverage.health,
      coveragePercent: d.coverage.coveragePercent,
      discoveryCandidateCount: d.discoveryCandidateCount,
      structuralInputInsufficient,
      likelyAmendment,
      potentiallyRelevantAmendmentNotFullyAnalyzed: likelyAmendment && structuralInputInsufficient,
      discoveryHealth,
      discoveryInputInsufficient: discoveryHealth !== "DISCOVERY_HEALTHY",
    };
  });

  const failedOrInsufficientCount = documents.filter((d) => d.structuralInputInsufficient).length;
  const dangerousAmendments = documents.filter((d) => d.potentiallyRelevantAmendmentNotFullyAnalyzed);
  const discoveryFailedDocs = documents.filter((d) => d.discoveryHealth === "DISCOVERY_FAILED");
  const discoveryPartialDocs = documents.filter((d) => d.discoveryHealth === "DISCOVERY_PARTIAL");
  const relationshipSafety = computeRelationshipSafety(relationshipCandidates);
  const operativeStateSafety = computeOperativeStateSafety(operativeStates);
  const unresolvedWholeDocumentAmendments = (unattachedAmendmentEffects ?? []).filter((e) => e.status === "REVIEW_REQUIRED" || e.status === "UNRESOLVED");
  const reasons: string[] = [];
  let state: PackageSafetyState = "PACKAGE_SAFE";

  if (dangerousAmendments.length > 0) {
    state = "PACKAGE_UNSAFE";
    reasons.push(`${dangerousAmendments.length} document(s) are POTENTIALLY_RELEVANT_AMENDMENT_NOT_FULLY_ANALYZED: ${dangerousAmendments.map((d) => d.documentId).join(", ")} - an amendment-shaped document with insufficient structural coverage may alter otherwise correctly analyzed base language without Headroom having seen the change.`);
  } else if (discoveryFailedDocs.length > 0) {
    state = "PACKAGE_UNSAFE";
    reasons.push(`${discoveryFailedDocs.length} document(s) have DISCOVERY_FAILED: ${discoveryFailedDocs.map((d) => d.documentId).join(", ")} - every Pass B section call failed for these documents, so their covenant candidate list cannot be trusted as complete.`);
  } else if (failedOrInsufficientCount > 0) {
    state = "PACKAGE_REVIEW_REQUIRED";
    reasons.push(`${failedOrInsufficientCount} of ${documents.length} document(s) have insufficient structural coverage but are not amendment-shaped.`);
  } else if (discoveryPartialDocs.length > 0) {
    state = "PACKAGE_REVIEW_REQUIRED";
    reasons.push(`${discoveryPartialDocs.length} document(s) have DISCOVERY_PARTIAL: ${discoveryPartialDocs.map((d) => d.documentId).join(", ")} - one or more Pass B section calls failed but were isolated rather than aborting the whole document; the surviving candidates are real but the document's candidate list may be incomplete.`);
  } else if (relationshipSafety.unresolvedMaterialRelationshipCount > 0) {
    // Task §21 - unresolved is safe-by-construction here (never a
    // confidently false edge), so this downgrades to REVIEW_REQUIRED,
    // never UNSAFE - "a package with unresolved relationships may still
    // be partially analyzable... do not force all-or-nothing failure."
    state = "PACKAGE_REVIEW_REQUIRED";
    reasons.push(`${relationshipSafety.unresolvedMaterialRelationshipCount} package-graph relationship candidate(s) from document(s) [${relationshipSafety.unresolvedDocumentIds.join(", ")}] are UNRESOLVED (ambiguous target, missing base document, or amendment target not established) - the affected document(s)' place in the package topology is not yet established, but this does not block analysis of other, resolved documents.`);
  } else if (operativeStateSafety.conflictedInstrumentCount > 0) {
    state = "PACKAGE_REVIEW_REQUIRED";
    reasons.push(`${operativeStateSafety.conflictedInstrumentCount} instrument(s) [${operativeStateSafety.conflictedInstrumentKeys.join(", ")}] have OPERATIVE_STATE_CONFLICTED provisions - two or more amendment effects conflict and cannot be silently resolved; a future semantic compiler must not treat these provisions' current text as authoritative until reviewed.`);
  } else if (operativeStateSafety.reviewRequiredInstrumentCount > 0) {
    state = "PACKAGE_REVIEW_REQUIRED";
    reasons.push(`${operativeStateSafety.reviewRequiredInstrumentCount} instrument(s) [${operativeStateSafety.reviewRequiredInstrumentKeys.join(", ")}] have OPERATIVE_STATE_REVIEW_REQUIRED provisions - at least one amendment effect's sequence position or resolution is uncertain.`);
  } else if (unresolvedWholeDocumentAmendments.length > 0) {
    // Task §17/§30 - a whole-document amendment effect (e.g. a marked/
    // conformed exhibit or schedule modification) never attaches to any
    // per-provision OperativeContractState, so it would otherwise be
    // invisible to the two branches above - surfaced here so it can never
    // silently leave a package looking PACKAGE_SAFE.
    state = "PACKAGE_REVIEW_REQUIRED";
    reasons.push(`${unresolvedWholeDocumentAmendments.length} whole-document amendment effect(s) from [${[...new Set(unresolvedWholeDocumentAmendments.map((e) => e.amendmentDocumentId))].join(", ")}] are ${unresolvedWholeDocumentAmendments[0]!.status} (e.g. a marked/conformed exhibit or schedule modification) - the amendment's target document is identified but its specific textual/structured content is not included in the analyzed source text.`);
  } else {
    reasons.push("All documents reached STRUCTURE_HEALTHY or STRUCTURE_PARTIAL with no significant unresolved coverage gaps, DISCOVERY_HEALTHY with no isolated section failures, every package-graph relationship candidate resolved or narrowed to a single reviewable candidate, and no instrument's operative contract state is conflicted or review-required.");
  }
  if (relationshipSafety.reviewRequiredRelationshipCount > 0) {
    reasons.push(`${relationshipSafety.reviewRequiredRelationshipCount} package-graph relationship candidate(s) are REVIEW_REQUIRED (a type-only match with a non-matching execution date) - a real candidate exists but needs human confirmation before being treated as resolved.`);
  }

  return {
    packageKey,
    documents,
    state,
    reasons,
    unresolvedMaterialRelationshipCount: relationshipSafety.unresolvedMaterialRelationshipCount,
    reviewRequiredRelationshipCount: relationshipSafety.reviewRequiredRelationshipCount,
    conflictedInstrumentCount: operativeStateSafety.conflictedInstrumentCount,
    operativeReviewRequiredInstrumentCount: operativeStateSafety.reviewRequiredInstrumentCount,
    unresolvedWholeDocumentAmendmentCount: unresolvedWholeDocumentAmendments.length,
    summarySentence: `${failedOrInsufficientCount} of ${documents.length} documents were not structurally analyzed successfully.`,
  };
}
