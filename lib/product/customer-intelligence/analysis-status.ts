/**
 * Rule 158: one shared source of truth for the document analysis status
 * label. The documents LIST page distinguished STAGED / ANALYZING /
 * RETRYABLE / FAILED, but the document DETAIL page collapsed everything
 * that was not ANALYZED into "FAILED" — so a document merely queued for
 * analysis showed a FAILED chip plus "Extraction did not produce usable
 * covenant candidates. Re-upload...", telling the user to re-upload a
 * document that was only waiting its turn. Pending is not failed, and
 * two pages must never disagree about the same row's state. Both pages
 * render from this helper.
 */

export type AnalysisStatusLabel = "ANALYZED" | "STAGED" | "ANALYZING" | "RETRYABLE" | "FAILED";

export interface AnalysisStatusInput {
  analysisOk: boolean;
  processingStatus: string | null;
}

export function analysisStatusOf(intel: AnalysisStatusInput): AnalysisStatusLabel {
  if (intel.analysisOk) return "ANALYZED";
  if (intel.processingStatus === "STAGED_PENDING_ANALYSIS") return "STAGED";
  if (intel.processingStatus === "ANALYZING") return "ANALYZING";
  if (intel.processingStatus === "FAILED_RETRYABLE") return "RETRYABLE";
  return "FAILED";
}

/** True when analysis has not run yet or is still running — not a failure. */
export function isAnalysisPending(intel: AnalysisStatusInput): boolean {
  const status = analysisStatusOf(intel);
  return status === "STAGED" || status === "ANALYZING";
}

/** Chip tone for a status label: pass for ANALYZED, navy for pending, trip for failure. */
export function analysisStatusTone(status: AnalysisStatusLabel): "pass" | "navy" | "trip" {
  if (status === "ANALYZED") return "pass";
  if (status === "STAGED" || status === "ANALYZING") return "navy";
  return "trip";
}

/** User-facing note for a not-yet-analyzed document. */
export function analysisPendingNote(): string {
  return "Durable bytes are saved; analysis is in progress or queued. Refresh shortly.";
}
