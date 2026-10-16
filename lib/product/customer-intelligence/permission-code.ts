/**
 * Pure counsel Permission code builders. Kept free of prisma
 * imports so they are unit-testable in isolation.
 *
 * Codes are `counsel:{sourceId}:{sectionRef}:{grantType}` with
 * unsafe characters sanitized to `_`. The REJECT supersede path
 * MUST rebuild its lookup prefix through the SAME sanitization
 * (rule 59) — a raw prefix never matches a code minted from a
 * section ref containing parens (e.g. "6.01(a)"), so the
 * rejected Permission stayed live and kept feeding capacity.
 */

function sanitizeCode(s: string): string {
  return s.replace(/[^a-zA-Z0-9:_.-]/g, "_");
}

export function permissionCode(sourceId: string, sectionRef: string, grantType: string): string {
  const safe = sanitizeCode(`${sourceId}:${sectionRef}:${grantType}`).slice(0, 180);
  return `counsel:${safe}`;
}

/** Lookup prefix for every Permission minted for (sourceId, sectionRef). */
export function permissionCodePrefix(sourceId: string, sectionRef: string): string {
  const safe = sanitizeCode(`${sourceId}:${sectionRef}:`).slice(0, 180);
  return `counsel:${safe}`;
}
