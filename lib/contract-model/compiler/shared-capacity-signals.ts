/**
 * Shared-capacity relationship language vs ordinary aggregate monetary limits.
 *
 * An "aggregate amount" / "aggregate principal amount not to exceed $X" is a
 * single-basket ceiling (or a prohibition threshold). It is NOT a shared-
 * capacity relationship. Shared capacity requires language that joins two or
 * more independently operative permissions into one pool — combined-with,
 * shared basket/capacity, aggregate-with/under a companion cite, together-
 * with a Section cite, or an explicit multi-clause sharing construction.
 *
 * Used by Pass A discovery, coverage-audit role assignment, and sibling
 * context typing so none of those layers invent SHARED_CAP from bare
 * aggregate monetary restrictions. Never package-specific.
 */

/**
 * True shared-pool / multi-permission ceiling relationship.
 * No trailing \\b — several arms end in `)` (clause cites), where a trailing
 * word-boundary would falsely reject a real match.
 */
export const SHARED_CAPACITY_RELATIONSHIP_RE =
  /\b(?:combined(?:\s+with)?\s+(?:with|capacity|basket)|shared\s+(?:capacity|basket|pool)|in\s+the\s+aggregate\s+(?:with|under)|together\s+with\b[^.]{0,240}?\b(?:pursuant\s+to|under)\s+(?:Sections?|§|Articles?|Clauses?)|when\s+combined\s+with|(?:this\s+)?clause\s*\([a-z0-9]+\)[^.]{0,80}?\band\b[^.]{0,80}?clause\s*\([a-z0-9]+\)|(?:made\s+)?in\s+reliance\s+on\s+this\s+clause\s*\([a-z0-9]+\)[^.]{0,120}?\band\b[^.]{0,80}?clause\s*\([a-z0-9]+\)|without\s+duplication\b[^.]{0,160}?\b(?:together\s+with|combined\s+with|in\s+the\s+aggregate\s+with))/i;

/**
 * Ordinary aggregate monetary restriction — single-permission ceiling /
 * threshold phrasing. Useful as a discovery ECONOMIC signal; never as a
 * shared-capacity relationship label by itself.
 */
export const ORDINARY_AGGREGATE_AMOUNT_RE =
  /\baggregate(?:d)?(?:\s+principal)?\s+(?:amount|cap|limit|basket|consideration|outstanding)\b/i;

export function isSharedCapacityRelationshipLanguage(text: string): boolean {
  return SHARED_CAPACITY_RELATIONSHIP_RE.test(text);
}

export function isOrdinaryAggregateAmountLanguage(text: string): boolean {
  return ORDINARY_AGGREGATE_AMOUNT_RE.test(text);
}

/**
 * Fail-closed gate: shared-capacity labeling requires relationship language.
 * Bare aggregate amount is never enough.
 */
export function classifyAggregateOrSharedCapacitySignal(
  text: string,
): "shared_cap" | "aggregate_amount" | null {
  if (isSharedCapacityRelationshipLanguage(text)) return "shared_cap";
  if (isOrdinaryAggregateAmountLanguage(text)) return "aggregate_amount";
  return null;
}
