/**
 * Pure usage-id helpers for the manual contract-ledger action.
 * Kept free of prisma imports so it is unit-testable in isolation.
 */

/**
 * Default usageId for a manual ledger entry. The old default was
 * `usage-<company>-<Date.now()>` — two legitimate rapid
 * submissions (double-click, two tabs) in the same millisecond
 * produced the SAME id, and the store's DUPLICATE_USAGE_ID guard
 * (correctly) rejected the second entry. The collision is now
 * impossible: a random suffix disambiguates same-millisecond ids
 * while the Date.now() prefix keeps ids sortable/readable. The
 * store duplicate guard stays as the backstop.
 */
export function defaultManualUsageId(companyId: string): string {
  return `usage-${companyId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}
