/**
 * Shared-capacity language detection.
 *
 * Bare "aggregate amount" / "in the aggregate" is an ordinary ceiling, not a
 * shared pool. Relationship language (combined with / shared basket / together
 * with under other clauses / without duplication across baskets) is required.
 *
 * Discovery labels only — not operative legal authority.
 */

/** Ordinary aggregate ceilings (disclosure / ranking only). */
export const AGGREGATE_CEILING_RE =
  /\b(?:in the aggregate|aggregate(?:d)?\s+(?:amount|principal|outstanding|indebtedness|investments?|payments?))\b/i;

/**
 * True shared-capacity / anti-stacking relationship language.
 * Includes multi-clause aggregate caps ("pursuant to clauses (f), (m) and (n)")
 * which share one ceiling across enumerated baskets — distinct from a bare
 * single-basket "aggregate amount" quantum.
 */
export const SHARED_CAPACITY_RELATIONSHIP_RE =
  /(?:\bshared\s+(?:capacity|basket|pool|amount)\b|\bcombined\s+(?:with|capacity|basket)\b|\bin\s+the\s+aggregate\s+(?:with|under)\b|\btogether\s+with\b[\s\S]{0,240}?\b(?:pursuant\s+to|under)\s+(?:Sections?|§|Articles?|clauses?)|\bwhen\s+combined\s+with\b|\bwithout\s+duplication\b|\baggregate(?:d)?\s+amount\b[\s\S]{0,220}?\bpursuant\s+to\s+clauses?\s*\([a-z0-9]+\)(?:\s*,\s*\([a-z0-9]+\))+\s*(?:and|,)\s*\([a-z0-9]+\))/i;

export const ANTI_STACKING_RE =
  /\b(?:without\s+duplication|anti[-\s]?stack(?:ing)?|anti[-\s]?duplication|shall\s+not\s+be\s+double[-\s]?counted|not\s+be\s+counted\s+twice)\b/i;

export function hasAggregateCeilingLanguage(text: string): boolean {
  return AGGREGATE_CEILING_RE.test(text);
}

export function hasSharedCapacityRelationship(text: string): boolean {
  return SHARED_CAPACITY_RELATIONSHIP_RE.test(text);
}

export function hasAntiStackingLanguage(text: string): boolean {
  return ANTI_STACKING_RE.test(text);
}

/**
 * Recognition predicate used for shared-capacity interpretation / CKG-style
 * checks. Prefer this over Pass A discovery signals.
 */
export function isSharedCapacityLanguage(text: string): boolean {
  return hasSharedCapacityRelationship(text) || hasAntiStackingLanguage(text);
}
