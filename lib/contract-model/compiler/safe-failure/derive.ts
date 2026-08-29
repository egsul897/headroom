/**
 * Phase 3F.1.5.R §9/§10 - emission-policy derivation.
 *
 * Pure functions only: every function here reads an ALREADY-COMPUTED result
 * from an unmodified pipeline stage (semantic-coverage's coverage audit is
 * the sole wired emission point this phase - see §9/§23 of
 * docs/phase-3f1-5-r-residual-foundation/02-failure-boundary-map.json for why
 * this is the smallest sufficient integration point) and derives a
 * ClaimReviewItemInput, or null when no review is warranted. No function
 * here queries a database, calls a model, or introduces any new semantic
 * judgment about whether a claim was correctly represented - that judgment
 * was already made by semantic-coverage's own reconciliation engine
 * (document-coverage.ts/package-coverage.ts), which independently combines
 * evidence from discovery, the semantic compiler, and the verifier before
 * ever producing a SemanticUnitCoverageEntry. This module's only job is
 * translating that existing per-unit safety signal into the persisted,
 * lifecycle-bearing production event this phase's charter requires.
 */
import type { DangerousUnaccountedReason, DangerousUnaccountedSemanticUnit, MaterialSemanticUnit, SemanticCoverageState, SemanticUnitCoverageEntry, SemanticUnitMateriality } from "../semantic-coverage/types";
import { claimKeyFromSemanticUnit } from "./identity";
import type { ClaimReviewItemInput, ClaimReviewPipelineStage, ClaimReviewReasonCode } from "./types";

/** Section 9's materiality gate, matching Evaluation Contract V3's own MATERIAL_TIERS convention (atomic-contract.ts) - the review-event architecture never fires for INFORMATIONAL/REVIEW_UNCERTAIN units, both to avoid alert spam (Section 24) and because those materialities are, by construction, not the CFO-facing claims this architecture exists to protect. */
const MATERIAL_TIERS = new Set<SemanticUnitMateriality>(["CRITICAL", "MATERIAL"]);

/** Coverage states that represent a genuine, unresolved safety gap. FULLY_REPRESENTED_VERIFIED is the one success state - explicitly excluded, never emits a review item. */
const REVIEWABLE_STATES = new Set<SemanticCoverageState>(["UNREPRESENTED", "UNSUPPORTED", "SOURCE_CONTEXT_INCOMPLETE", "OPERATIVE_STATE_UNRESOLVED", "AMBIGUOUS_MATCH", "PARTIALLY_REPRESENTED", "FULLY_REPRESENTED_REVIEW_REQUIRED"]);

/**
 * Best-effort coarse classification only - never authoritative (same
 * discipline as SemanticCompilerErrorDetail.failureCategory elsewhere in
 * this codebase: "best-effort coarse bucket for triage... never
 * authoritative"). The entry's own `reasoning` string (always populated,
 * required by SemanticUnitCoverageEntry) is what actually carries the real
 * explanation, copied verbatim into ClaimReviewItemInput.rationale below -
 * reasonCode exists only for dashboard-style filtering/aggregation.
 */
function coarseReasonForCoverageState(state: SemanticCoverageState): ClaimReviewReasonCode {
  switch (state) {
    case "UNSUPPORTED":
      return "UNSUPPORTED_EXPRESSION";
    case "SOURCE_CONTEXT_INCOMPLETE":
      return "INSUFFICIENT_CONTEXT";
    case "OPERATIVE_STATE_UNRESOLVED":
      return "OPERATIVE_STATE_UNCERTAIN";
    case "AMBIGUOUS_MATCH":
      return "SEMANTIC_AMBIGUITY";
    case "PARTIALLY_REPRESENTED":
      return "MISSING_REQUIRED_SEMANTIC_DIMENSION";
    case "FULLY_REPRESENTED_REVIEW_REQUIRED":
      return "SEMANTIC_AMBIGUITY";
    case "UNREPRESENTED":
      return "COMPILATION_FAILURE";
    case "FULLY_REPRESENTED_VERIFIED":
      // Unreachable via REVIEWABLE_STATES - listed for exhaustiveness only.
      return "OTHER_REVIEW_REQUIRED";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function coarseReasonForDangerousReason(reason: DangerousUnaccountedReason): ClaimReviewReasonCode {
  switch (reason) {
    case "NO_CANDIDATE_EVER_DISCOVERED":
      // Section 31's own distinction: this unit WAS detected by
      // semantic-coverage's own source-side inventory (Layer A/B/C) - that
      // is what "encountered" means here - even though the separate Phase
      // 2B discovery pass never produced a compiler candidate for it. Not
      // the "Headroom never noticed this text at all" case Section 31
      // places out of scope; that case produces no MaterialSemanticUnit at
      // all and therefore never reaches this function.
      return "MISSING_REQUIRED_SEMANTIC_DIMENSION";
    case "CANDIDATE_DISCOVERED_NEVER_COMPILED":
      return "COMPILATION_FAILURE";
    case "COMPILED_BUT_UNIT_OMITTED_FROM_IR":
      return "MISSING_REQUIRED_SEMANTIC_DIMENSION";
    case "COMPILED_BUT_MATERIALLY_MISREPRESENTED":
      return "VERIFICATION_CONTRADICTION";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export interface DeriveFromCoverageInput {
  unit: MaterialSemanticUnit;
  entry: SemanticUnitCoverageEntry;
  dangerous: DangerousUnaccountedSemanticUnit | null;
  companyId: string;
  packageKey: string | null;
  instrumentKey: string | null;
  coverageAlgorithmVersion: string;
}

/**
 * The sole derivation function this phase wires into a live emission point
 * (semantic-coverage/pipeline.ts, via service.ts's
 * recordClaimReviewsFromCoverage). Returns null when the unit does not merit
 * a review item: below-material tiers, or a coverage state that already
 * represents success.
 */
export function deriveFromCoverageEntry(input: DeriveFromCoverageInput): ClaimReviewItemInput | null {
  const { unit, entry, dangerous } = input;

  if (!MATERIAL_TIERS.has(unit.materiality)) return null;
  if (!REVIEWABLE_STATES.has(entry.coverageState)) return null;

  const anchor = unit.anchors[0] ?? null;
  // A unit with no anchor has no safe FK target (ClaimReviewItem.documentId
  // is a required foreign key) - this should not occur in practice (every
  // MaterialSemanticUnit is anchored except the raw-source-fallback path,
  // which still anchors via a synthetic span per structural-coverage.ts),
  // but fail closed rather than fabricate a documentId.
  if (!anchor) return null;

  const reasonCode = dangerous ? coarseReasonForDangerousReason(dangerous.reason) : coarseReasonForCoverageState(entry.coverageState);
  const unresolvedDimensions: string[] = entry.missingEconomicElement ? [entry.missingEconomicElement] : [];
  const sourceEvidence = dangerous?.sourceEvidence ?? unit.excerptText;
  const rationale = dangerous?.auditorReasoning ?? entry.reasoning;

  return {
    companyId: input.companyId,
    packageKey: input.packageKey,
    instrumentKey: input.instrumentKey,
    documentId: anchor.documentId,
    claimKey: claimKeyFromSemanticUnit({ semanticUnitId: unit.semanticUnitId }),
    structuralNodeId: anchor?.structuralNodeId ?? null,
    sectionRef: anchor?.sectionRef ?? null,
    charStart: anchor?.charStart ?? null,
    charEnd: anchor?.charEnd ?? null,
    covenantFamily: unit.family,
    materiality: unit.materiality,
    reasonCode,
    unresolvedDimensions,
    originStage: "COVERAGE_AUDITOR" satisfies ClaimReviewPipelineStage,
    sourceEvidence,
    sourceCitation: anchor?.sourceCitation ?? null,
    relatedSemanticObjectId: entry.matchedIrIds[0] ?? null,
    operativeVersionRef: unit.operativeVersionRef,
    rationale,
    algorithmVersion: input.coverageAlgorithmVersion,
  };
}
