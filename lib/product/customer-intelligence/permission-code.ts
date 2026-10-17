/**
 * Pure counsel Permission code builders. Kept free of prisma
 * imports so they are unit-testable in isolation.
 *
 * Codes are `counsel:{sourceId}:{sectionRef}:{category}:{grantType}`
 * with unsafe characters sanitized to `_`. The category is part of
 * the code because two summary items can share (sourceId,
 * sectionRef) with DIFFERENT categories (e.g. Strata 1.01(g)(c)(c)
 * as EVENTS_OF_DEFAULT and as OTHER) — Fix 6 isolated the
 * DECISIONS on (ref, category), but the old code (no category)
 * meant the two items' Permissions shared one code: the second
 * item's compile overwrote the first's Permission, and a REJECT
 * of one superseded the other's. Counsel-review isolation must
 * hold at the compile layer too, not just the decision layer.
 * Category sits BEFORE grantType so the REJECT prefix
 * (`sourceId:sectionRef:category:`) matches exactly one item's
 * Permissions across all its grant types.
 *
 * The REJECT supersede path MUST rebuild its lookup prefix
 * through the SAME sanitization (rule 59) — a raw prefix never
 * matches a code minted from a section ref containing parens
 * (e.g. "6.01(a)"), so the rejected Permission stayed live and
 * kept feeding capacity.
 *
 * Pre-launch code-scheme change: no production Permissions exist
 * yet (the live Quila document needs re-analysis), so no
 * migration of old-format codes is needed.
 */

function sanitizeCode(s: string): string {
  return s.replace(/[^a-zA-Z0-9:_.-]/g, "_");
}

export function permissionCode(sourceId: string, sectionRef: string, grantType: string, category: string): string {
  const safe = sanitizeCode(`${sourceId}:${sectionRef}:${category}:${grantType}`).slice(0, 180);
  return `counsel:${safe}`;
}

/** Lookup prefix for every Permission minted for (sourceId, sectionRef, category). */
export function permissionCodePrefix(sourceId: string, sectionRef: string, category: string): string {
  const safe = sanitizeCode(`${sourceId}:${sectionRef}:${category}:`).slice(0, 180);
  return `counsel:${safe}`;
}
