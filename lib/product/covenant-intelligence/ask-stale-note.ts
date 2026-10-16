/**
 * Pure stale-analysis disclosure for Ask retrieval. Kept free
 * of prisma imports so it is unit-testable in isolation.
 */

/**
 * Disclosure note when Ask relied on summaries that predate
 * the current analyzer build. Returns null when nothing is
 * stale. Titles are capped at 3 with an ellipsis count so one
 * stale-heavy workspace cannot flood the answer.
 */
export function staleAnalysisNote(staleTitles: readonly string[]): string | null {
  if (staleTitles.length === 0) return null;
  const shown = staleTitles.slice(0, 3).join(", ");
  const more = staleTitles.length > 3 ? `, and ${staleTitles.length - 3} more` : "";
  return (
    `${staleTitles.length} document(s) relied on analyses from an older analyzer build (stale) — ` +
    `re-analyze for current interpretations: ${shown}${more}.`
  );
}
