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
 */
import type { StructuralIndex } from "../structural-index";
import type { PackageDocumentInput } from "../package-graph/types";
import type { AmendmentEffectCandidate } from "./types";

export interface VerificationFinding {
  effectId: string;
  amendmentDocumentId: string;
  checks: {
    /** null when the target has no document id claimed at all (a correctly-UNRESOLVED effect). */
    targetDocumentExists: boolean | null;
    /** null when the target is whole-document scoped (no section/definition to check). */
    targetSectionOrDefinitionExists: boolean | null;
    /** null when the effect makes no newText claim. */
    newTextFoundInSource: boolean | null;
  };
  passed: boolean;
  issues: string[];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function verifyAmendmentEffectsIndependently(effects: AmendmentEffectCandidate[], documents: PackageDocumentInput[], index: StructuralIndex): VerificationFinding[] {
  const documentIds = new Set(documents.map((d) => d.documentId));
  const textByDocumentId = new Map(documents.map((d) => [d.documentId, d.text] as const));

  return effects.map((effect) => {
    const issues: string[] = [];

    const targetDocumentExists = effect.target.targetDocumentId === null ? null : documentIds.has(effect.target.targetDocumentId);
    if (targetDocumentExists === false) issues.push(`Target document "${effect.target.targetDocumentId}" does not exist in this package - a fabricated or stale target reference.`);

    let targetSectionOrDefinitionExists: boolean | null = null;
    if (effect.target.targetDocumentId && effect.target.targetSectionRef) {
      // Phase 3F.1.2: existence-only probe via findNodesByRef (never the
      // deprecated singleton getNodeByRef, whose `!== null` comparison was
      // also always true since it returns undefined, not null, on a miss).
      targetSectionOrDefinitionExists = index.findNodesByRef(effect.target.targetDocumentId, effect.target.targetSectionRef).length > 0;
      if (!targetSectionOrDefinitionExists) issues.push(`Cited section "${effect.target.targetSectionRef}" does not resolve in document "${effect.target.targetDocumentId}"'s own structural index.`);
    } else if (effect.target.targetDocumentId && effect.target.targetDefinedTermRef) {
      targetSectionOrDefinitionExists = index.getDefinitionFullText(effect.target.targetDefinedTermRef, effect.target.targetDocumentId) !== null || index.getDefinitionFullText(effect.target.targetDefinedTermRef) !== null;
      if (!targetSectionOrDefinitionExists) issues.push(`Cited defined term "${effect.target.targetDefinedTermRef}" does not resolve in document "${effect.target.targetDocumentId}"'s own definitions.`);
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
      passed: issues.length === 0,
      issues,
    };
  });
}
