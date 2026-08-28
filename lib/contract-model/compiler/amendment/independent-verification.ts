/**
 * Phase 2G §31 - independent verification of the amendment pipeline's own
 * output. Deliberately does NOT trust any field the pipeline itself
 * already computed (resolutionMethod, status, or validation.ts's own
 * verdict) - it re-derives, from the raw package inputs alone, whether
 * each effect's claims are actually supported: does the cited target
 * document exist in this package; does the cited section/definition
 * actually resolve in the structural index; and, when the effect claims
 * captured replacement text, does that text actually appear in the real
 * amendment document's own raw source (re-fetched fresh here, never
 * reading the effect's own sourceExcerpt as if it were proof of itself).
 *
 * This is the deterministic half of task §31's "do not rely only on the
 * interpreter to verify itself... use deterministic source comparison
 * and, where necessary, a separate adversarial semantic verification
 * pass." The semantic half (a second bounded model call asking "does
 * this operative representation accurately reflect the amendment") is
 * intentionally NOT implemented in this V1: every semantic-interpretation
 * effect the real CONMED regression and the §26 synthetic tests produced
 * was already downgraded to REVIEW_REQUIRED/low-confidence by
 * validation.ts before reaching here, so there is no confidently-
 * resolved semantic effect in this phase's own evidence for a second
 * model call to usefully double-check - a disclosed scope decision, not
 * a silent gap (see the Phase 2G final report's own §31/known-limitations
 * items).
 *
 * Phase 3F.1.4 Workstream D (§6C) - two fixes over the Phase 2G V1 above:
 *
 *  1. STRENGTHENED target check. The original `targetSectionOrDefinitionExists`
 *     was an EXISTENCE-only probe (`findNodesByRef(...).length > 0` /
 *     `getDefinitionFullText(...) !== null`) - TRUE for an AMBIGUOUS (2+
 *     candidates) match exactly as much as a genuinely UNIQUE one, so it
 *     could only ever catch a NOT_FOUND target, never an AMBIGUOUS one
 *     (the audit's own P0 CENTRAL FINDING: "even where independent
 *     verification WOULD be called, its existence-only check can't
 *     distinguish UNIQUE from AMBIGUOUS"). Fixed by re-deriving a real
 *     three-way UNIQUE/AMBIGUOUS/NOT_FOUND resolution directly against the
 *     structural index for both SECTION (via `resolveUniqueNodeByRef`,
 *     the index's own primitive) and DEFINITION (via a small,
 *     independently-written document-scoped uniqueness check over
 *     `index.allDefinitions()`, deliberately NOT sharing
 *     operative-state.ts's own `buildProvisionView`/`resolveBaseText`
 *     code path - Architecture Invariant #17's "the system that proposes
 *     and the system that checks must not be the same pass").
 *     `targetSectionOrDefinitionExists` is now true ONLY for a genuinely
 *     UNIQUE resolution; `targetResolutionStatus` names the real verdict
 *     (including AMBIGUOUS explicitly, with its candidate count) for a
 *     caller that wants more than a boolean.
 *
 *  2. WIRED INTO THE LIVE PIPELINE. This function previously had zero real
 *     callers outside one-off diagnostic scripts (grep-confirmed by the
 *     audit). It is now invoked from `pipeline.ts`'s own
 *     `runAmendmentPipeline` as a real gate: any effect the pipeline
 *     itself marked RESOLVED, but which this INDEPENDENT re-check cannot
 *     itself confirm, is downgraded to REVIEW_REQUIRED before ever
 *     reaching operative-state.ts. Kept as a genuinely separate pass
 *     (never merged into buildProvisionView's own logic) so it remains
 *     real defense-in-depth against a FUTURE regression in
 *     buildProvisionView's own target-resolution consumption, not merely
 *     a second copy of the same check - see pipeline.ts's own comment at
 *     the call site for why this remains worth keeping even after
 *     buildProvisionView's own P0 fix (Architecture Invariant #18's own
 *     caveat: both this module and operative-state.ts still share Phase
 *     2A's structural-index substrate, so this is real but bounded
 *     independence, disclosed as such, not a claim of full isolation).
 */
import type { StructuralIndex } from "../structural-index";
import type { PackageDocumentInput } from "../package-graph/types";
import type { AmendmentEffectCandidate, ProvisionTargetResolutionStatus } from "./types";

export interface VerificationFinding {
  effectId: string;
  amendmentDocumentId: string;
  checks: {
    /** null when the target has no document id claimed at all (a correctly-UNRESOLVED effect). */
    targetDocumentExists: boolean | null;
    /** Phase 3F.1.4 §6C: true ONLY for a genuinely UNIQUE resolution - never true merely because at least one candidate exists. null when the target is whole-document scoped (no section/definition to check). */
    targetSectionOrDefinitionExists: boolean | null;
    /** null when the effect makes no newText claim. */
    newTextFoundInSource: boolean | null;
  };
  /** Phase 3F.1.4 §6C - the real, independently-derived three-way verdict (distinguishing AMBIGUOUS from NOT_FOUND, unlike the boolean above's necessarily coarser true/false). null when the target is whole-document scoped. */
  targetResolutionStatus: ProvisionTargetResolutionStatus | null;
  passed: boolean;
  issues: string[];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Independent, document-scoped definition-ambiguity check built entirely
 * from `index.allDefinitions()` - deliberately NOT importing or calling
 * anything from operative-state.ts, so a bug introduced only in that
 * module's own consumption of target-resolution status does not silently
 * escape this separate pass too.
 */
function resolveDefinitionIndependently(index: StructuralIndex, documentId: string, term: string): ProvisionTargetResolutionStatus {
  const normalized = term.replace(/\s+/g, " ").trim().toLowerCase();
  const matches = index.allDefinitions().filter((d) => d.documentId === documentId && d.normalizedTerm === normalized);
  if (matches.length === 0) return "NOT_FOUND";
  if (matches.length === 1) return "UNIQUE";
  return "AMBIGUOUS";
}

export function verifyAmendmentEffectsIndependently(effects: AmendmentEffectCandidate[], documents: PackageDocumentInput[], index: StructuralIndex): VerificationFinding[] {
  const documentIds = new Set(documents.map((d) => d.documentId));
  const textByDocumentId = new Map(documents.map((d) => [d.documentId, d.text] as const));

  return effects.map((effect) => {
    const issues: string[] = [];

    const targetDocumentExists = effect.target.targetDocumentId === null ? null : documentIds.has(effect.target.targetDocumentId);
    if (targetDocumentExists === false) issues.push(`Target document "${effect.target.targetDocumentId}" does not exist in this package - a fabricated or stale target reference.`);

    let targetSectionOrDefinitionExists: boolean | null = null;
    let targetResolutionStatus: ProvisionTargetResolutionStatus | null = null;
    if (effect.target.targetDocumentId && effect.target.targetSectionRef) {
      // Phase 3F.1.4 §6C: resolveUniqueNodeByRef directly (the index's own
      // three-way primitive), not the existence-only findNodesByRef count -
      // an AMBIGUOUS (2+ candidate) match must FAIL this check, exactly
      // like a NOT_FOUND one, never pass merely because something exists.
      const resolution = index.resolveUniqueNodeByRef(effect.target.targetDocumentId, effect.target.targetSectionRef);
      targetResolutionStatus = resolution.status;
      targetSectionOrDefinitionExists = resolution.status === "UNIQUE";
      if (resolution.status === "AMBIGUOUS") issues.push(`Cited section "${effect.target.targetSectionRef}" is AMBIGUOUS in document "${effect.target.targetDocumentId}"'s own structural index (${resolution.candidates.length} distinct physical occurrences share this legal reference) - not safely attachable to a single provision.`);
      else if (resolution.status === "NOT_FOUND") issues.push(`Cited section "${effect.target.targetSectionRef}" does not resolve in document "${effect.target.targetDocumentId}"'s own structural index.`);
    } else if (effect.target.targetDocumentId && effect.target.targetDefinedTermRef) {
      targetResolutionStatus = resolveDefinitionIndependently(index, effect.target.targetDocumentId, effect.target.targetDefinedTermRef);
      // Phase 3F.1.4 §6A/§6C parity with operative-state.ts's own
      // resolveBaseText: an ADD_DEFINITION effect's own term is EXPECTED
      // to be absent from the base document (it is being introduced for
      // the first time) - a NOT_FOUND verdict here is the correct,
      // expected state for exactly this operation, never a fabrication
      // signal. AMBIGUOUS is still flagged even for ADD_DEFINITION - 2+
      // pre-existing colliding definitions of a term the amendment claims
      // to newly add is a genuine anomaly worth surfacing.
      const isExpectedNewTerm = targetResolutionStatus === "NOT_FOUND" && effect.operation === "ADD_DEFINITION";
      targetSectionOrDefinitionExists = targetResolutionStatus === "UNIQUE" || isExpectedNewTerm;
      if (targetResolutionStatus === "AMBIGUOUS") issues.push(`Cited defined term "${effect.target.targetDefinedTermRef}" is AMBIGUOUS in document "${effect.target.targetDocumentId}"'s own definitions (2+ distinct definitions share this term) - not safely attachable to a single provision.`);
      else if (targetResolutionStatus === "NOT_FOUND" && !isExpectedNewTerm) issues.push(`Cited defined term "${effect.target.targetDefinedTermRef}" does not resolve in document "${effect.target.targetDocumentId}"'s own definitions.`);
    }

    let newTextFoundInSource: boolean | null = null;
    if (effect.newText) {
      const sourceText = textByDocumentId.get(effect.amendmentDocumentId);
      newTextFoundInSource = sourceText !== undefined && normalize(sourceText).includes(normalize(effect.newText));
      if (!newTextFoundInSource) issues.push(`Claimed replacement/added text does not appear verbatim in amendment document "${effect.amendmentDocumentId}"'s own raw source - possible fabrication.`);
    }

    return {
      effectId: effect.effectId,
      amendmentDocumentId: effect.amendmentDocumentId,
      checks: { targetDocumentExists, targetSectionOrDefinitionExists, newTextFoundInSource },
      targetResolutionStatus,
      passed: issues.length === 0,
      issues,
    };
  });
}
