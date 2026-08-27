/**
 * Phase 2G §7 - deterministic amendment-operation parsing. Builds on top
 * of Phase 2C's own already-resolved ModificationCandidate[] (which
 * already identifies the amending document, its target document/section/
 * definition, and a coarse operation) rather than re-detecting targets
 * from scratch - this module's own job is narrower: refine the coarse
 * ModificationOperation into the finer AmendmentOperation taxonomy, and
 * capture verbatim replacement/added text when the amendment's own
 * source text explicitly supplies it (never synthesized - task §11's
 * "AI may interpret legal transformation, it may not manufacture source
 * evidence" applies equally to deterministic code).
 *
 * Three amendment-shaped patterns this module adds beyond §9's own
 * per-clause detection, all generalized legal-drafting conventions:
 *  - full amendment-and-restatement (task §14): when the SOURCE document
 *    itself classifies as AMENDED_AND_RESTATED_AGREEMENT (Phase 2C), the
 *    correct representation is ONE RESTATE_AGREEMENT effect against the
 *    whole target instrument, never hundreds of synthesized per-section
 *    effects the source text never actually enumerates section-by-section.
 *  - definition add/delete/replace (task §5): the existing coarse
 *    MODIFY pattern for definitions is refined into ADD_DEFINITION/
 *    DELETE_DEFINITION/REPLACE_DEFINITION when the verb is unambiguous,
 *    falling back to MODIFY_DEFINITION when it is not.
 *  - reaffirmation (task §16/§25 scenario 20): "hereby reaffirms its
 *    guarantee/obligations" - a real, common amendment/joinder clause
 *    that changes nothing textually but must not be silently dropped.
 */
import type { ModificationCandidate } from "../package-graph/types";
import type { AmendmentEffectCandidate, AmendmentOperation, AmendmentTarget, EffectiveDateResult } from "./types";
import { hashParts } from "../hashing";

// Terminates on a blank line (a real paragraph boundary) or end of text -
// NEVER on the literal word "Section", since the quoted REPLACEMENT text
// itself very often restates the same section number as its own first
// words ("...to read as follows: Section 6.01 Indebtedness. ..."), which
// would otherwise make a lazy capture terminate immediately after the
// colon and capture nothing.
const REPLACEMENT_TEXT_CAPTURE_RE = /(?:amended and restated in its entirety to read as follows|amended by adding the following|amended and restated to read in its entirety as follows)\s*:?\s*["“]?([\s\S]{1,3000}?)["”]?(?:\n\s*\n|$)/;

const DEFINITION_ADD_RE = /the definition of[\s]*[""]?([A-Z][A-Za-z0-9 ]{1,60})[""]?\s+is (?:hereby )?added/i;
const DEFINITION_DELETE_RE = /the definition of[\s]*[""]?([A-Z][A-Za-z0-9 ]{1,60})[""]?\s+is (?:hereby )?deleted/i;
const DEFINITION_REPLACE_RE = /the definition of[\s]*[""]?([A-Z][A-Za-z0-9 ]{1,60})[""]?\s+is (?:hereby )?amended and restated (?:in its entirety )?to read(?: in its entirety)? as follows\s*:?\s*["“]?([\s\S]{1,3000}?)["”]?(?:\n\s*\n|$)/i;

const REAFFIRMATION_RE = /\bhereby\s+reaffirms?\b.{0,80}\b(?:guarantee|guaranty|obligations?|liability)\b/i;
const NO_TEXTUAL_CHANGE_RE = /\b(?:remains?|shall remain)\s+(?:in full force and effect\s+)?unchanged\b|for the avoidance of doubt.{0,120}\bno (?:other )?(?:amendment|change|modification)\b/i;

function excerpt(text: string, charStart: number, matchLength: number): string {
  const start = Math.max(0, charStart - 40);
  const end = Math.min(text.length, charStart + matchLength + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/** Refines a coarse Phase-2C ModificationCandidate into the finer AmendmentOperation taxonomy + captures verbatim text where the amendment's own source explicitly supplies it. */
function refineOperationAndText(mc: ModificationCandidate, amendmentText: string): { operation: AmendmentOperation; newText: string | null } {
  const region = mc.sourceText;

  if (mc.targetDefinedTermRef) {
    if (DEFINITION_ADD_RE.test(region)) return { operation: "ADD_DEFINITION", newText: null };
    if (DEFINITION_DELETE_RE.test(region)) return { operation: "DELETE_DEFINITION", newText: null };
    const replaceMatch = DEFINITION_REPLACE_RE.exec(amendmentText.slice(Math.max(0, amendmentText.indexOf(region.slice(0, 40)) - 20), undefined));
    if (replaceMatch) return { operation: "REPLACE_DEFINITION", newText: replaceMatch[2]!.trim() };
    return { operation: "MODIFY_DEFINITION", newText: null };
  }

  if (mc.operation === "RESTATE") {
    const captureMatch = REPLACEMENT_TEXT_CAPTURE_RE.exec(amendmentText.slice(Math.max(0, amendmentText.indexOf(region.slice(0, 40)) - 20), undefined));
    return { operation: "REPLACE_TEXT", newText: captureMatch ? captureMatch[1]!.trim() : null };
  }
  if (mc.operation === "ADD") {
    const captureMatch = REPLACEMENT_TEXT_CAPTURE_RE.exec(amendmentText.slice(Math.max(0, amendmentText.indexOf(region.slice(0, 40)) - 20), undefined));
    return { operation: "ADD_TEXT", newText: captureMatch ? captureMatch[1]!.trim() : null };
  }
  if (mc.operation === "DELETE") return { operation: "DELETE_TEXT", newText: null };
  if (mc.operation === "MODIFY") return { operation: "MODIFY_PROVISION", newText: null };
  return { operation: "UNKNOWN_CHANGE", newText: null };
}

export interface DeterministicParseInput {
  amendmentDocumentId: string;
  amendmentText: string;
  amendmentLabel: string;
  /** Whether Phase 2C classified this SOURCE document as AMENDED_AND_RESTATED_AGREEMENT - drives the full-restatement short-circuit (task §14). */
  isFullRestatement: boolean;
  /** The resolved target document/instrument this restatement applies to, when isFullRestatement is true. */
  restatementTargetDocumentId: string | null;
  restatementTargetInstrumentKey: string | null;
  modificationCandidates: ModificationCandidate[];
  resolveEffectiveDate: () => EffectiveDateResult;
  instrumentKeyForDocument: (documentId: string | null) => string | null;
  /**
   * §17 - "amendment precedence must consume [multi-target] relationships
   * safely... never force one amendment document into one target
   * instrument." When Phase 2C's own modification-candidate resolution
   * left a target undecided because the amending document references
   * MORE than one other agreement (relationship-resolution.ts's own
   * conservative "which one this specific modification targets was not
   * disambiguated" outcome), this callback lets the amendment layer use
   * REAL structural evidence - does the referenced section/definition
   * actually EXIST in one, and only one, of the amendment's own already-
   * resolved multi-target relationship candidates? - to disambiguate
   * deterministically, never a guess. Returns null when it cannot
   * disambiguate (zero or more than one real match), leaving the
   * original REVIEW_REQUIRED/UNRESOLVED status untouched.
   */
  disambiguateMultiTargetSection?: (sectionRef: string | null, definedTermRef: string | null) => { targetDocumentId: string; targetInstrumentKey: string | null } | null;
}

export function parseDeterministicAmendmentEffects(input: DeterministicParseInput): AmendmentEffectCandidate[] {
  const effectiveDate = input.resolveEffectiveDate();
  const results: AmendmentEffectCandidate[] = [];

  // §14 - full amendment-and-restatement short-circuit: one effect for
  // the whole target instrument, never a synthesized per-section list.
  if (input.isFullRestatement) {
    const target: AmendmentTarget = {
      kind: "DOCUMENT",
      targetDocumentId: input.restatementTargetDocumentId,
      targetInstrumentKey: input.restatementTargetInstrumentKey,
      targetStructuralNodeKey: null,
      targetSectionRef: null,
      targetDefinedTermRef: null,
      targetHint: input.restatementTargetDocumentId ? null : "full agreement restatement, target document not resolved",
    };
    results.push({
      effectId: hashParts(["amendment-effect", input.amendmentDocumentId, "RESTATE_AGREEMENT", "full-restatement"]),
      amendmentDocumentId: input.amendmentDocumentId,
      target,
      operation: "RESTATE_AGREEMENT",
      effectiveDate,
      newText: null,
      oldText: null,
      sourceCitation: input.amendmentLabel,
      sourceExcerpt: input.amendmentText.slice(0, 300).replace(/\s+/g, " ").trim(),
      confidence: input.restatementTargetDocumentId ? 0.9 : 0.3,
      status: input.restatementTargetDocumentId ? "RESOLVED" : "REVIEW_REQUIRED",
      unresolvedReason: input.restatementTargetDocumentId ? null : "This document is classified as a full amendment-and-restatement, but its own restated target document could not be resolved.",
      resolutionMethod: "DETERMINISTIC_FULL_RESTATEMENT",
    });
    return results;
  }

  // §25 scenario 20 - reaffirmation without textual change.
  const reaffirmMatch = REAFFIRMATION_RE.exec(input.amendmentText.slice(0, 6000));
  if (reaffirmMatch) {
    results.push({
      effectId: hashParts(["amendment-effect", input.amendmentDocumentId, "REAFFIRM", String(reaffirmMatch.index)]),
      amendmentDocumentId: input.amendmentDocumentId,
      target: { kind: "DOCUMENT", targetDocumentId: null, targetInstrumentKey: null, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: null, targetHint: reaffirmMatch[0] },
      operation: "REAFFIRM",
      effectiveDate,
      newText: null,
      oldText: null,
      sourceCitation: input.amendmentLabel,
      sourceExcerpt: excerpt(input.amendmentText, reaffirmMatch.index, reaffirmMatch[0].length),
      confidence: 0.75,
      status: "REVIEW_REQUIRED",
      unresolvedReason: "A reaffirmation clause was detected but its target instrument/obligation was not further resolved in this V1 - no textual change results from this effect either way.",
      resolutionMethod: "DETERMINISTIC_REAFFIRMATION",
    });
  }

  for (const mc of input.modificationCandidates) {
    if (mc.sourceDocumentId !== input.amendmentDocumentId) continue;
    if (NO_TEXTUAL_CHANGE_RE.test(mc.sourceText)) {
      results.push({
        effectId: hashParts(["amendment-effect", input.amendmentDocumentId, "NO_TEXTUAL_CHANGE", mc.sourceText.slice(0, 60)]),
        amendmentDocumentId: input.amendmentDocumentId,
        target: { kind: mc.targetSectionRef ? "SECTION" : "UNKNOWN", targetDocumentId: mc.targetDocumentId, targetInstrumentKey: input.instrumentKeyForDocument(mc.targetDocumentId), targetStructuralNodeKey: null, targetSectionRef: mc.targetSectionRef, targetDefinedTermRef: null, targetHint: mc.targetHint },
        operation: "NO_TEXTUAL_CHANGE",
        effectiveDate,
        newText: null,
        oldText: null,
        sourceCitation: mc.sourceNodeCitation,
        sourceExcerpt: mc.sourceText,
        confidence: mc.confidence,
        status: mc.status,
        unresolvedReason: mc.unresolvedReason,
        resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
      });
      continue;
    }

    const { operation, newText } = refineOperationAndText(mc, input.amendmentText);

    let targetDocumentId = mc.targetDocumentId;
    let status = mc.status;
    let unresolvedReason = mc.unresolvedReason;
    let resolutionMethod: AmendmentEffectCandidate["resolutionMethod"] = "DETERMINISTIC_EXPLICIT_PATTERN";
    if (!targetDocumentId && (mc.targetSectionRef || mc.targetDefinedTermRef) && input.disambiguateMultiTargetSection) {
      const disambiguated = input.disambiguateMultiTargetSection(mc.targetSectionRef, mc.targetDefinedTermRef);
      if (disambiguated) {
        targetDocumentId = disambiguated.targetDocumentId;
        status = "RESOLVED";
        unresolvedReason = null;
        resolutionMethod = "DETERMINISTIC_EXPLICIT_PATTERN";
      }
    }

    const target: AmendmentTarget = {
      kind: mc.targetDefinedTermRef ? "DEFINITION" : mc.targetSectionRef ? "SECTION" : targetDocumentId ? "DOCUMENT" : "UNKNOWN",
      targetDocumentId,
      targetInstrumentKey: input.instrumentKeyForDocument(targetDocumentId),
      targetStructuralNodeKey: null,
      targetSectionRef: mc.targetSectionRef,
      targetDefinedTermRef: mc.targetDefinedTermRef,
      targetHint: mc.targetHint,
    };

    results.push({
      effectId: hashParts(["amendment-effect", input.amendmentDocumentId, operation, mc.targetSectionRef ?? "", mc.targetDefinedTermRef ?? "", mc.sourceText.slice(0, 60)]),
      amendmentDocumentId: input.amendmentDocumentId,
      target,
      operation,
      effectiveDate,
      newText,
      oldText: null,
      sourceCitation: mc.sourceNodeCitation,
      sourceExcerpt: mc.sourceText,
      confidence: mc.confidence,
      status,
      unresolvedReason,
      resolutionMethod,
    });
  }

  return results;
}
