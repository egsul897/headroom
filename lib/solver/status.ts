/**
 * Phase 5 - alternative-path status semantics.
 *
 * Implements docs/solver-architecture-design.md §M precisely: path-level
 * aggregation (worstOf a single path's own RequirementResults, with
 * TRANSACTION_ASSUMPTION gaps distinguished from every other unresolved
 * requirement) and the Requirement-Group-level precedence order
 * `CLEAR > BLOCKED (only if unanimous) > ASSUMPTION_REQUIRED >
 * REVIEW_REQUIRED > NOT_TESTED`.
 *
 * This is the direct, generalized fix for the legacy engine's `MAX`-as-OR
 * bug (legal-model-remediation-design.md §2.2): there, `combineCrossDocument`
 * /`evalExpr`'s `MAX` node applies `worstStatus` ACROSS every alternative
 * before picking the best value, so one alternative being `not_tested`/
 * `review_required` poisons a genuinely clear sibling. The fix here is
 * structural, not a patched comparison: `pathStatus` is computed once per
 * path from ONLY that path's own `RequirementResult`s (never seeing another
 * path's results at all), and `aggregateOverallStatus` only ever looks at
 * the resulting per-path statuses - there is no code path by which a
 * REVIEW_REQUIRED alternative's own requirement results can leak into a
 * CLEAR alternative's aggregation. lib/covenant-engine.ts's `worstStatus`/
 * `evalExpr` MAX node are left completely unmodified (task's explicit
 * instruction: "do not silently redefine legacy MAX unless the architecture
 * explicitly requires it... prefer a new solver-native relationship/
 * operator") - this file is that new operator, not a patch to the old one.
 */

import type { PathStatus, PermissionPath, RequirementResult } from "./types";

/**
 * design doc §M.2 point 1 - a single path's status, computed from ONLY that
 * path's own RequirementResults. `TRANSACTION_ASSUMPTION` gaps (or any
 * result explicitly flagged `reasonCategory: "MISSING_ASSUMPTION"`) are
 * tracked separately from every other kind of `UNKNOWN`, because the
 * caller-facing remedy differs (design doc §M.1: "the remedy is 'the caller
 * supplies a value,' not 'a human resolves ambiguity'").
 */
export function pathStatus(results: RequirementResult[]): PathStatus {
  if (results.length === 0) return "NOT_TESTED";
  if (results.some((r) => r.status === "FAILED")) return "BLOCKED";

  const unknowns = results.filter((r) => r.status === "UNKNOWN");
  if (unknowns.length === 0) return "CLEAR";

  const isAssumptionGap = (r: RequirementResult) => r.class === "TRANSACTION_ASSUMPTION" || r.reasonCategory === "MISSING_ASSUMPTION";
  return unknowns.every(isAssumptionGap) ? "ASSUMPTION_REQUIRED" : "REVIEW_REQUIRED";
}

/**
 * design doc §M.2 point 2/3 - the Requirement-Group-level aggregation,
 * expressed as the exact strict, order-independent lattice the design doc
 * specifies: `CLEAR > BLOCKED (only if unanimous) > ASSUMPTION_REQUIRED >
 * REVIEW_REQUIRED > NOT_TESTED`. A single pass, no re-derivation of
 * individual RequirementResults - it only ever consumes already-computed
 * per-path statuses, which is what makes the "one alternative never poisons
 * another" guarantee hold structurally rather than by careful ordering of
 * comparisons.
 */
export function aggregateOverallStatus(pathStatuses: PathStatus[]): PathStatus {
  if (pathStatuses.length === 0) return "NOT_TESTED";
  if (pathStatuses.includes("CLEAR")) return "CLEAR";
  if (pathStatuses.every((s) => s === "BLOCKED")) return "BLOCKED";
  if (pathStatuses.includes("ASSUMPTION_REQUIRED")) return "ASSUMPTION_REQUIRED";
  if (pathStatuses.includes("REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  return "NOT_TESTED";
}

/**
 * design doc §D / task §5 point 5 - "preserve which alternative was actually
 * relied upon." Deterministic tie-break (task §13/design doc §D): among
 * every CLEAR path, prefer the one allocating the largest total amount
 * (the most capacity-efficient reliance on the transaction's own request),
 * then the lexicographically smallest path id as a final, fully
 * deterministic tie-break. Documented here as the single source of truth
 * for this ordering - lib/solver/election.ts calls this rather than
 * re-implementing tie-break logic.
 */
export function selectWinningPath(paths: PermissionPath[]): PermissionPath | undefined {
  const clear = paths.filter((p) => p.status === "CLEAR");
  if (clear.length === 0) return undefined;
  return [...clear].sort((a, b) => {
    const totalA = a.legs.reduce((sum, leg) => sum + leg.amountAllocated, 0);
    const totalB = b.legs.reduce((sum, leg) => sum + leg.amountAllocated, 0);
    if (totalB !== totalA) return totalB - totalA;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * Every non-winning path, with a human-readable rejection reason derived
 * from its own status - design doc §N `alternatives`, task §16 ("rejected
 * alternatives... never silently dropped").
 */
export function rejectedAlternatives(paths: PermissionPath[], winner: PermissionPath | undefined): { path: PermissionPath; rejectionReason: string }[] {
  return paths
    .filter((p) => p !== winner)
    .map((path) => {
      const reason =
        path.status === "BLOCKED"
          ? `Blocked: ${path.conditionsTested.find((c) => c.status === "FAILED")?.detail ?? "at least one requirement failed."}`
          : path.status === "REVIEW_REQUIRED"
            ? `Review required: ${path.conditionsTested.find((c) => c.status === "UNKNOWN")?.detail ?? "at least one requirement is unresolved."}`
            : path.status === "ASSUMPTION_REQUIRED"
              ? `Assumption required: ${path.assumptionsUsed.find((a) => a.provided === "missing")?.field ?? "a transaction assumption"} was not supplied.`
              : path.status === "CLEAR"
                ? "A different CLEAR path was selected as the winner under the deterministic tie-break rule (see selectWinningPath)."
                : "Not tested: no applicable requirement data exists for this path.";
      return { path, rejectionReason: reason };
    });
}
