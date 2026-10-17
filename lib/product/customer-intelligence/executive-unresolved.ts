/**
 * Pure executive-unresolved list for the covenant review
 * workspace. Kept free of prisma imports so it is unit-testable
 * in isolation.
 */

/**
 * Build the executive "unresolved" list: first unresolved
 * question per item (spread across items), deduped, capped at
 * 8 — with a disclosure marker when more questions exist. The
 * old code silently truncated: an item with 3 unresolved
 * questions showed only the first, and a workspace with 20
 * questions showed 8, with no marker that the list was
 * partial. Same disclosure rule as summary/compare caps
 * (rules 7/31): a cap must say it is a cap.
 */
export function executiveUnresolved(
  items: Array<{ sectionRef: string; unresolvedQuestions?: string[] }>,
): string[] {
  const all = new Set(
    items.flatMap((i) => (i.unresolvedQuestions ?? []).map((u) => `§${i.sectionRef}: ${u}`)),
  );
  const shown = Array.from(
    new Set(
      items.flatMap((i) => (i.unresolvedQuestions ?? []).slice(0, 1).map((u) => `§${i.sectionRef}: ${u}`)),
    ),
  ).slice(0, 8);
  if (all.size > shown.length) {
    shown.push(
      `… and ${all.size - shown.length} more unresolved question(s) — see the covenant categories below.`,
    );
  }
  return shown;
}
