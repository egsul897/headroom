/**
 * Pure path selection for verified simulate. Kept free of prisma /
 * certified-transaction imports so it is unit-testable in
 * isolation.
 */
import type { EnumeratedCertifiedPath } from "@/lib/product/north-star-workflow/verified-path-enumeration";

export type PathSelectionResult = {
  chosen: EnumeratedCertifiedPath | null;
  error: string | null;
  autoSelected: boolean;
};

/**
 * Exact path identity. Caller-supplied pathId must match an
 * ELIGIBLE candidate exactly (CANDIDATE + capacity expression);
 * unknown / stale / ineligible pathIds fail closed (no silent
 * fallback to "the only other" path). Eligibility is enforced
 * here, not by caller pre-filtering — a caller passing an
 * unfiltered list must still never select an ineligible path.
 *
 * When no pathId is supplied: auto-select only if exactly one
 * eligible candidate exists.
 */
export function selectEnumeratedPath(
  candidates: readonly EnumeratedCertifiedPath[],
  pathId?: string | null,
): PathSelectionResult {
  const eligible = candidates.filter(
    (p) => p.status === "CANDIDATE" && p.permission.hasCapacityExpression,
  );
  const explicit = pathId != null && String(pathId).trim() !== "";
  if (explicit) {
    const want = String(pathId).trim();
    const match = eligible.find((p) => p.pathId === want) ?? null;
    if (match) {
      return { chosen: match, error: null, autoSelected: false };
    }
    const ineligibleMatch = candidates.some((p) => p.pathId === want);
    return {
      chosen: null,
      error: ineligibleMatch ? `PATH_INELIGIBLE:${want}` : `PATH_NOT_FOUND:${want}`,
      autoSelected: false,
    };
  }
  if (eligible.length === 1) {
    return { chosen: eligible[0]!, error: null, autoSelected: true };
  }
  if (eligible.length === 0) {
    return { chosen: null, error: "NO_CANDIDATE_PATHS", autoSelected: false };
  }
  return {
    chosen: null,
    error: `PATH_SELECTION_REQUIRED:${eligible.length}_candidates`,
    autoSelected: false,
  };
}
