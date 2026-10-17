/**
 * Pure matching-provision truncation disclosure for Ask
 * answers. Kept free of prisma imports so it is unit-testable
 * in isolation.
 */

/**
 * Disclosure note when the composed Ask answer shows only the
 * top N of M matching provisions. Returns null when nothing
 * was omitted. Same disclosure rule as summary/compare caps
 * (rules 7/31/48): a cap must say it is a cap.
 */
export function matchingProvisionsTruncationNote(shown: number, totalMatched: number): string | null {
  if (totalMatched <= shown) return null;
  return `Answer shows the top ${shown} of ${totalMatched} matching provisions; additional matches exist in the workspace.`;
}
