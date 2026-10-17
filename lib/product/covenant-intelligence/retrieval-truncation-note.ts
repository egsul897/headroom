/**
 * Pure Ask retrieval-truncation disclosure. Kept free of prisma
 * imports so it is unit-testable in isolation.
 */

/**
 * Disclosure when Ask's document fetch hit its cap: the answer
 * was composed from the N most recently filed documents while
 * older documents exist and were never searched. Null when
 * nothing was truncated.
 */
export function retrievalTruncationNote(params: {
  totalCount: number;
  searchedCount: number;
}): string | null {
  if (params.totalCount <= params.searchedCount) return null;
  const omitted = params.totalCount - params.searchedCount;
  return (
    `Ask searched the ${params.searchedCount} most recently filed documents; ` +
    `${omitted} older document(s) were not searched — provisions in older documents may be omitted from this answer.`
  );
}
