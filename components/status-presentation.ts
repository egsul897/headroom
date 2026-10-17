/**
 * Status presentation (design system, docs/DESIGN_SYSTEM.md).
 *
 * Known codes get a plain-language label and a tone. The original code
 * stays on `data-status` (rendered by StatusBadge) and the hint is the
 * tooltip. Unmapped codes render in the unknown tone with the words of
 * the code and an explicit "no success or failure implied" hint — the
 * badge must never invent a friendlier status than the contract.
 *
 * Tone meanings for a CFO:
 * - clear: this check is in a good state (green is not "borrow this").
 * - attention: a person has to finish something before the number can
 *   be relied on.
 * - stop: do not treat this as allowed.
 * - info: context (a clause citation is not a stop; a rejection is a
 *   decision, not a failure).
 * - unknown: nothing was invented.
 */
export type StatusTone = "clear" | "attention" | "stop" | "info" | "unknown";

export interface PresentedStatus {
  label: string;
  tone: StatusTone;
  hint: string;
}

const KNOWN: Record<string, PresentedStatus> = {
  ACCEPTED: { label: "Accepted", tone: "clear", hint: "Accepted as an operative interpretation." },
  EDITED: { label: "Edited", tone: "clear", hint: "Edited and accepted as an operative interpretation." },
  REJECTED: { label: "Rejected", tone: "info", hint: "Rejected — not counted as an operative interpretation." },
  SYSTEM_ACCEPTED: {
    label: "System-accepted",
    tone: "info",
    hint: "Auto-accepted by Headroom as a routine interpretation. Not counsel-verified.",
  },
  COUNSEL_DECIDED: { label: "Counsel-decided", tone: "clear", hint: "Decided by counsel." },
  AI_DRAFT: {
    label: "AI draft",
    tone: "unknown",
    hint: "Proposed by Headroom; not decided yet.",
  },
  NEEDS_INPUT: {
    label: "Needs input",
    tone: "attention",
    hint: "Headroom cannot decide this without human input.",
  },
  REVIEW_REQUIRED: {
    label: "Review required",
    tone: "attention",
    hint: "Requires counsel review before the number can be relied on.",
  },
  DISCOVERED: {
    label: "Discovered",
    tone: "info",
    hint: "Discovered in the documents. Not counsel-approved.",
  },
  ANALYZED: { label: "Analyzed", tone: "info", hint: "Analysis completed." },
  PENDING: { label: "Pending", tone: "unknown", hint: "Not yet analyzed. No success or failure implied." },
  QUEUED: { label: "Queued", tone: "unknown", hint: "Waiting to be analyzed. No success or failure implied." },
  STAGED: { label: "Staged", tone: "unknown", hint: "Uploaded and staged. No success or failure implied." },
  FAILED: { label: "Failed", tone: "stop", hint: "Analysis failed. Do not rely on this result." },
  FAILED_RETRYABLE: {
    label: "Failed — retryable",
    tone: "stop",
    hint: "Analysis failed but can be retried. Do not rely on this result.",
  },
  VERIFIED: { label: "Verified", tone: "clear", hint: "Verified." },
  UNVERIFIED: { label: "Unverified", tone: "unknown", hint: "Not verified. No success or failure implied." },
  REVIEWED: { label: "Reviewed", tone: "clear", hint: "Reviewed." },
  EXECUTABLE: { label: "Executable", tone: "clear", hint: "Executable path exists." },
  NOT_DETERMINABLE: {
    label: "Not determinable",
    tone: "unknown",
    hint: "Cannot be determined from the available inputs. Nothing was invented.",
  },
  NOT_EVALUATED: {
    label: "Not evaluated",
    tone: "unknown",
    hint: "Not evaluated. No success or failure implied.",
  },
  BLOCKED: { label: "Blocked", tone: "stop", hint: "Blocked. Do not treat this as allowed." },
  CLEAR: { label: "Clear", tone: "clear", hint: "This check is in a good state." },
};

function codeToWords(code: string): string {
  return code
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function presentStatus(code: string): PresentedStatus {
  const known = KNOWN[code.toUpperCase()];
  if (known) return known;
  return {
    label: codeToWords(code),
    tone: "unknown",
    hint: "No success or failure implied.",
  };
}
