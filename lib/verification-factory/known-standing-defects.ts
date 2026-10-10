/**
 * Known standing incorrect-favorable findings — independently grounded expectations
 * that current production engines fail. Soft gate still reports them; exit fails only
 * on unexpected (non-allowlisted) incorrect favorables.
 *
 * Do not expand this list to hide regressions. Each entry needs a tracked remediation.
 */

export const KNOWN_STANDING_INCORRECT_FAVORABLES: ReadonlyArray<{
  caseId: string;
  note: string;
  trackedSince: string;
}> = [
  {
    caseId: "gnd-conmed-76-above-45m",
    note:
      "CONMED §7.6 $45M RP exceeds $40M fiscal-year basket from source text; engine returns PERMITTED (likely intra-doc Investment OR-path). Independent GT: PROHIBITED on §7.6.",
    trackedSince: "2026-10-10",
  },
];

export function isKnownStandingIncorrectFavorable(caseId: string): boolean {
  return KNOWN_STANDING_INCORRECT_FAVORABLES.some((d) => d.caseId === caseId);
}
