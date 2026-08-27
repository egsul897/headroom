/**
 * Phase 2G - "marked/conformed exhibit" amendment detection. A real,
 * generalized, common amendment mechanism for complex multi-page
 * amendments (confirmed real on CONMED Document D's own text: "The
 * Credit Agreement... is hereby amended effective to delete the
 * stricken text... and to add the double-underlined text... as set
 * forth in the pages of the Amended Credit Agreement attached as
 * Exhibit A") - the actual textual changes live in an ATTACHED
 * blackline/conformed exhibit, not in the amendment's own body text.
 * Deterministic parsing correctly cannot (and must not) extract specific
 * replace/add/delete text for this shape, since that text was never
 * actually in the analyzed source at all - but staying completely
 * silent about a real, material, whole-document amendment would itself
 * be a form of dangerous silence (task §1's own central invariant).
 * This module detects the pattern and produces an honest, whole-
 * document UNKNOWN_CHANGE effect, resolved to whichever of the
 * amendment's own already-resolved relationship targets its nearest
 * preceding agreement-name mention identifies - never a guess when that
 * mention is absent or ambiguous.
 */
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "./types";
import { hashParts } from "../hashing";

// Real-document PDF/HTML-to-text extraction routinely breaks a fixed
// legal phrase across a line (e.g. "double-underlined\ntext" instead of
// "double-underlined text") - every multi-word phrase below uses \s+
// rather than a literal space so extraction-artifact line breaks never
// defeat the match (confirmed necessary against CONMED Document D's own
// curated text, which breaks mid-phrase in exactly this way).
const MARKUP_EXHIBIT_RE = /is\s+hereby\s+amended(?:\s+effective)?\s+to\s+delete\s+the\s+stricken\s+text[\s\S]{0,150}?and\s+to\s+add\s+the\s+double-underlined\s+text[\s\S]{0,250}?attached\s+as\s+Exhibit\s+[A-Z0-9]+/gi;

const AGREEMENT_LABELS = ["Guarantee and Collateral Agreement", "Guaranty and Collateral Agreement", "Guarantee and Security Agreement", "Pledge and Security Agreement", "Credit Agreement", "Indenture", "Security Agreement", "Intercreditor Agreement"];

function nearestPrecedingAgreementLabel(text: string, matchIndex: number): string | null {
  const window = text.slice(Math.max(0, matchIndex - 300), matchIndex);
  let best: { label: string; index: number } | null = null;
  for (const label of AGREEMENT_LABELS) {
    const idx = window.lastIndexOf(label);
    if (idx !== -1 && (!best || idx > best.index)) best = { label, index: idx };
  }
  return best?.label ?? null;
}

export interface MarkupExhibitResolutionCandidate {
  documentId: string;
  /** True when this resolved relationship target's own classification/label matches the given agreement-name text (case/punctuation-insensitive substring match), e.g. a document classified GUARANTEE_AND_SECURITY_AGREEMENT matches "Guarantee and Collateral Agreement". */
  matchesLabel: (label: string) => boolean;
}

export interface MarkupExhibitDetectionInput {
  amendmentDocumentId: string;
  amendmentText: string;
  amendmentLabel: string;
  effectiveDate: EffectiveDateResult;
  /** The amendment's own already-RESOLVED relationship targets (from Phase 2C/2F.3's multi-target resolution) - the only candidates a markup-exhibit reference may ever resolve to. */
  resolvedTargets: MarkupExhibitResolutionCandidate[];
}

export function detectMarkupExhibitEffects(input: MarkupExhibitDetectionInput): AmendmentEffectCandidate[] {
  const results: AmendmentEffectCandidate[] = [];
  const re = new RegExp(MARKUP_EXHIBIT_RE.source, MARKUP_EXHIBIT_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(input.amendmentText)) !== null) {
    const label = nearestPrecedingAgreementLabel(input.amendmentText, m.index);
    const matches = label ? input.resolvedTargets.filter((t) => t.matchesLabel(label)) : [];
    const targetDocumentId = matches.length === 1 ? matches[0]!.documentId : null;

    const target: AmendmentTarget = {
      kind: "DOCUMENT",
      targetDocumentId,
      targetInstrumentKey: null,
      targetStructuralNodeKey: null,
      targetSectionRef: null,
      targetDefinedTermRef: null,
      targetHint: label,
    };

    results.push({
      effectId: hashParts(["amendment-effect", input.amendmentDocumentId, "MARKUP_EXHIBIT", String(m.index)]),
      amendmentDocumentId: input.amendmentDocumentId,
      target,
      operation: "UNKNOWN_CHANGE",
      effectiveDate: input.effectiveDate,
      newText: null,
      oldText: null,
      sourceCitation: input.amendmentLabel,
      sourceExcerpt: input.amendmentText.slice(Math.max(0, m.index - 150), m.index + m[0].length).replace(/\s+/g, " ").trim(),
      confidence: targetDocumentId ? 0.6 : 0.2,
      status: targetDocumentId ? "REVIEW_REQUIRED" : "UNRESOLVED",
      unresolvedReason: `This amendment modifies the target document via an attached marked/conformed exhibit (a blackline showing "stricken" and "double-underlined" text) that is not included in the analyzed source text - the specific textual changes cannot be determined from the amendment's own body text alone.${targetDocumentId ? "" : " Its target agreement could not be determined either."}`,
      resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    });
  }
  return results;
}
