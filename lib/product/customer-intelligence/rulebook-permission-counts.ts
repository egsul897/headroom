/**
 * Pure Permission review counting for the rulebook readiness
 * ladder. Kept free of prisma imports so it is unit-testable in
 * isolation.
 */
import { hasCompletedQualifiedLegalReview } from "@/lib/legal-review";

/**
 * Count Permission rows that have completed qualified legal
 * review. The old code used /VERIFIED|REVIEWED|APPROVED/i —
 * which matches "UNVERIFIED" as a substring, so EVERY
 * compiler-minted row (default UNVERIFIED) counted as reviewed
 * and the ladder could report REVIEWED/EXECUTABLE with zero
 * actual counsel verification. Only VERIFIED counts, via the
 * canonical predicate.
 */
export function verifiedPermissionCount(reviewStatuses: readonly string[]): number {
  return reviewStatuses.filter((s) => hasCompletedQualifiedLegalReview(s as "UNVERIFIED" | "VERIFIED" | "DISPUTED")).length;
}
