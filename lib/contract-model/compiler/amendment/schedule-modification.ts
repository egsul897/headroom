/**
 * Phase 2G - schedule-modification amendment detection. A real,
 * generalized amendment-drafting pattern (confirmed real on CONMED
 * Document D's own text: "the 'Term A-2 Commitments' set forth on
 * Schedule 1 of this Amendment are hereby added to Schedule 1.1 of the
 * Credit Agreement") - a schedule (lender lists, commitment amounts,
 * subsidiary lists, pricing grids, etc.) is added to, replaced, or
 * amended on a named target agreement. Like markup-exhibit.ts, the
 * schedule's own actual content is structured data attached elsewhere
 * (a separate schedule/exhibit page, not covenant prose in the
 * amendment's own body) - deterministic parsing can identify WHICH
 * schedule of WHICH agreement changed, but must not fabricate the
 * schedule's contents. Produces an honest MODIFY_SCHEDULE effect,
 * REVIEW_REQUIRED when the target agreement is resolved, UNRESOLVED
 * when it cannot be determined - never a guess.
 */
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "./types";
import { hashParts } from "../hashing";

// Two common phrasings: (1) "...are/is hereby added to Schedule X of
// [the|this] <Agreement>" and (2) "Schedule X [of [the|this] <Agreement>]
// is hereby amended/replaced/amended and restated". Every phrase uses
// \s+ rather than a literal space so extraction-artifact line breaks
// (confirmed necessary on real CONMED Document D's own text - see
// markup-exhibit.ts's own header comment) never defeat the match.
const SCHEDULE_ADDED_TO_RE = /(?:are|is)\s+hereby\s+added\s+to\s+Schedule\s+([A-Za-z0-9.]+)\s+of\s+(?:the|this)\s+([A-Z][A-Za-z ]{1,60}?)(?=[;.,\n])/gi;
const SCHEDULE_REPLACED_RE = /Schedule\s+([A-Za-z0-9.]+)\s+(?:of\s+(?:the|this)\s+([A-Z][A-Za-z ]{1,60}?)\s+)?is\s+hereby\s+(?:amended\s+and\s+restated|replaced|amended)\b/gi;

export interface ScheduleModificationResolutionCandidate {
  documentId: string;
  /** True when this resolved relationship target's own classification/identity matches the given agreement-name text (case/punctuation-insensitive), mirroring markup-exhibit.ts's own matchesLabel contract. */
  matchesLabel: (label: string) => boolean;
}

export interface ScheduleModificationDetectionInput {
  amendmentDocumentId: string;
  amendmentText: string;
  amendmentLabel: string;
  effectiveDate: EffectiveDateResult;
  /** The amendment's own already-RESOLVED relationship targets - used as a fallback when a match has only one resolved target and no agreement name was captured inline. */
  resolvedTargets: ScheduleModificationResolutionCandidate[];
}

function resolveTarget(label: string | undefined, resolvedTargets: ScheduleModificationResolutionCandidate[]): { targetDocumentId: string | null; targetHint: string | null } {
  if (label) {
    const matches = resolvedTargets.filter((t) => t.matchesLabel(label));
    if (matches.length === 1) return { targetDocumentId: matches[0]!.documentId, targetHint: label };
    return { targetDocumentId: null, targetHint: label };
  }
  // No agreement name captured inline (e.g. "Schedule 1.1 is hereby amended" alone) - only safe to resolve when exactly one document is a candidate at all.
  if (resolvedTargets.length === 1) return { targetDocumentId: resolvedTargets[0]!.documentId, targetHint: null };
  return { targetDocumentId: null, targetHint: null };
}

function buildEffect(input: ScheduleModificationDetectionInput, scheduleRef: string, label: string | undefined, matchIndex: number, matchLength: number): AmendmentEffectCandidate {
  const { targetDocumentId, targetHint } = resolveTarget(label, input.resolvedTargets);
  const target: AmendmentTarget = {
    kind: "DOCUMENT",
    targetDocumentId,
    targetInstrumentKey: null,
    targetStructuralNodeKey: null,
    targetSectionRef: null,
    targetDefinedTermRef: null,
    targetHint: targetHint ? `Schedule ${scheduleRef} of ${targetHint}` : `Schedule ${scheduleRef}`,
  };
  return {
    effectId: hashParts(["amendment-effect", input.amendmentDocumentId, "MODIFY_SCHEDULE", scheduleRef, String(matchIndex)]),
    amendmentDocumentId: input.amendmentDocumentId,
    target,
    operation: "MODIFY_SCHEDULE",
    effectiveDate: input.effectiveDate,
    newText: null,
    oldText: null,
    sourceCitation: input.amendmentLabel,
    sourceExcerpt: input.amendmentText.slice(Math.max(0, matchIndex - 150), matchIndex + matchLength).replace(/\s+/g, " ").trim(),
    confidence: targetDocumentId ? 0.6 : 0.2,
    status: targetDocumentId ? "REVIEW_REQUIRED" : "UNRESOLVED",
    unresolvedReason: `This amendment modifies Schedule ${scheduleRef}${targetHint ? ` of ${targetHint}` : ""} - the schedule's own content (e.g. a lender/commitment/subsidiary/pricing list) is structured data attached separately, not textual language in the amendment's own body, so it cannot be rendered as amended covenant text.${targetDocumentId ? "" : " Its target agreement could not be determined either."}`,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
  };
}

export function detectScheduleModificationEffects(input: ScheduleModificationDetectionInput): AmendmentEffectCandidate[] {
  const results: AmendmentEffectCandidate[] = [];
  const seen = new Set<string>();

  for (const pattern of [SCHEDULE_ADDED_TO_RE, SCHEDULE_REPLACED_RE]) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(input.amendmentText)) !== null) {
      const scheduleRef = m[1]!;
      const label = m[2]?.trim();
      const dedupeKey = `${scheduleRef}:${m.index}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        results.push(buildEffect(input, scheduleRef, label, m.index, m[0].length));
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return results;
}
