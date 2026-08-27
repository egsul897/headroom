/**
 * Phase C Stage 7 - AMENDMENT / OPERATIVE-STATE RESOLUTION (task §27/§28).
 * Integrates the existing Phase-B AmendmentEffect/getOperativeContractualState
 * machinery (docs/contract-model-foundation-phase-b.md §I/§J) rather than
 * building a second one. Deliberately conservative for v1: this stage
 * detects whether a package's own documents look amendment-shaped
 * (heading text containing "Amendment"/"Restated"/"Supplement") and, if
 * none do, reports NOT_APPLICABLE honestly rather than fabricating an
 * amendment-resolution result for a package that has none - real amendment
 * PARSING (turning amendment text into AmendmentEffect rows) is out of
 * scope for this v1 (see docs/phase-c-contract-compiler-v1.md's own
 * disclosed limitation) exactly as Phase B's own §13 scoped it out.
 */
import type { CompilerDocumentInput, StageRunResult } from "./types";

const AMENDMENT_MARKERS = /\b(Amendment|Amended and Restated|Supplement(?:al)?|Waiver)\b/i;

export interface AmendmentStageOutput {
  packageHasAmendmentShapedDocument: boolean;
  amendmentShapedDocumentIds: string[];
}

export function runAmendmentsStage(documents: CompilerDocumentInput[]): StageRunResult<AmendmentStageOutput> {
  const amendmentShaped = documents.filter((d) => AMENDMENT_MARKERS.test(d.label) || AMENDMENT_MARKERS.test(d.text.slice(0, 2000)));
  if (amendmentShaped.length === 0) {
    return {
      status: "COMPLETED",
      output: { packageHasAmendmentShapedDocument: false, amendmentShapedDocumentIds: [] },
      notes: ["NOT_APPLICABLE: no document in this package looks amendment-shaped - amendment/operative-state resolution was not exercised. Real amendment-effect PARSING is out of scope for this v1 regardless (representation-only, per Phase B's own §13 scope limit)."],
    };
  }
  return {
    status: "REVIEW_REQUIRED",
    output: { packageHasAmendmentShapedDocument: true, amendmentShapedDocumentIds: amendmentShaped.map((d) => d.documentId) },
    notes: [`${amendmentShaped.length} document(s) look amendment-shaped, but this v1 does not parse amendment text into AmendmentEffect rows - flagged REVIEW_REQUIRED rather than silently treating the package as a single unamended document.`],
  };
}
