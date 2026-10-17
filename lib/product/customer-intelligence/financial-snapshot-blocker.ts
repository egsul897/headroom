/**
 * Pure financial-snapshot blocker messaging for capacity
 * readiness. Kept free of prisma imports so it is unit-testable
 * in isolation.
 */
import type { FinancialIdentityResolution } from "@/lib/financial-identity";

/**
 * Blocker for the financial-snapshot leg of capacity readiness.
 * UNIQUE → null (no blocker). AMBIGUOUS must NOT say "no
 * snapshot": rows exist, they conflict, and uploading another
 * one does not fix it — the cohort needs resolving to one
 * canonical snapshot. UNKNOWN → genuinely missing.
 */
export function financialSnapshotBlocker(
  resolution: FinancialIdentityResolution<unknown>,
): string | null {
  if (resolution.status === "UNIQUE") return null;
  if (resolution.status === "AMBIGUOUS") {
    return (
      `Multiple conflicting FinancialStates in the latest cohort (${resolution.matchCount} rows) — ` +
      `resolve to a single canonical snapshot before capacity can be evaluated; Headroom will not pick one.`
    );
  }
  return (
    "No dated FinancialState on the legacy path — ratio/grower tests and engine capacity cannot be evaluated " +
    "(Phase 4B APPROVED snapshots are a separate North-Star store)."
  );
}
