/**
 * Known standing incorrect-favorable findings — independently grounded expectations
 * that current production engines fail. Soft gate still reports them; exit fails only
 * on unexpected (non-allowlisted) incorrect favorables.
 *
 * Do not expand this list to hide regressions. Each entry needs a tracked remediation.
 *
 * Cycle 2 → CONMED §7.6 correction: `gnd-conmed-76-above-45m` removed after GT was
 * revised (selected-basket insufficiency ≠ whole-transaction PROHIBITED; §7.6(e)
 * path + Investment cross-family OR fix).
 */

export const KNOWN_STANDING_INCORRECT_FAVORABLES: ReadonlyArray<{
  caseId: string;
  note: string;
  trackedSince: string;
}> = [];

export function isKnownStandingIncorrectFavorable(caseId: string): boolean {
  return KNOWN_STANDING_INCORRECT_FAVORABLES.some((d) => d.caseId === caseId);
}
