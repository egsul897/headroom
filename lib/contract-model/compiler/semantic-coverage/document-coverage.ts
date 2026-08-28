/**
 * Phase 3E §158 - document-level coverage rollup + fail-closed gate. A
 * declared reconciliation-stage module. Reports raw AND materiality-
 * weighted metrics TOGETHER (task's own "never let 99 trivial units hide 1
 * critical omission") - never one without the other.
 */
import { computeFamilySummaries } from "./family-coverage";
import type { DangerousUnaccountedSemanticUnit, DocumentCoverageResult, MaterialSemanticUnit, SemanticUnitCoverageEntry, SemanticUnitMateriality } from "./types";

const FULLY_REPRESENTED_STATES = new Set(["FULLY_REPRESENTED_VERIFIED", "FULLY_REPRESENTED_REVIEW_REQUIRED"]);

/**
 * Weights chosen so a single CRITICAL miss visibly moves the weighted
 * fraction even against many trivial units - CRITICAL is weighted an order
 * of magnitude above INFORMATIONAL, never averaged away by volume alone.
 */
const MATERIALITY_WEIGHT: Record<SemanticUnitMateriality, number> = { CRITICAL: 8, MATERIAL: 3, REVIEW_UNCERTAIN: 1, INFORMATIONAL: 0.1 };

export function computeDocumentCoverage(documentId: string, units: MaterialSemanticUnit[], entries: SemanticUnitCoverageEntry[], dangerousUnaccounted: DangerousUnaccountedSemanticUnit[]): DocumentCoverageResult {
  const entryByUnitId = new Map(entries.map((e) => [e.semanticUnitId, e]));
  const familySummaries = computeFamilySummaries(units, entries, dangerousUnaccounted);

  let fullyRepresentedCount = 0;
  let weightedFullyRepresentedSum = 0;
  let weightedTotal = 0;
  for (const unit of units) {
    const state = entryByUnitId.get(unit.semanticUnitId)?.coverageState;
    const isFull = state ? FULLY_REPRESENTED_STATES.has(state) : false;
    if (isFull) fullyRepresentedCount += 1;
    const weight = MATERIALITY_WEIGHT[unit.materiality];
    weightedTotal += weight;
    if (isFull) weightedFullyRepresentedSum += weight;
  }

  const rawFullyRepresentedFraction = units.length > 0 ? fullyRepresentedCount / units.length : 1;
  const materialityWeightedFullyRepresentedFraction = weightedTotal > 0 ? weightedFullyRepresentedSum / weightedTotal : 1;

  const gateFailureReasons: string[] = [];
  const criticalDangerous = dangerousUnaccounted.filter((d) => d.materiality === "CRITICAL");
  if (criticalDangerous.length > 0) gateFailureReasons.push(`${criticalDangerous.length} CRITICAL dangerous-unaccounted semantic unit(s) with no adequate compiled/verified IR representation`);
  const materialDangerous = dangerousUnaccounted.filter((d) => d.materiality === "MATERIAL");
  if (materialDangerous.length > 0) gateFailureReasons.push(`${materialDangerous.length} MATERIAL dangerous-unaccounted semantic unit(s) with no adequate compiled/verified IR representation`);
  const missingFamilies = familySummaries.filter((f) => f.entireFamilyMissing);
  for (const f of missingFamilies) gateFailureReasons.push(`entire family ${f.family} (${f.unitCount} unit(s), at least one CRITICAL/MATERIAL) has zero representation anywhere in the compiled/verified IR`);
  const unresolvedOperativeState = entries.filter((e) => e.coverageState === "OPERATIVE_STATE_UNRESOLVED");
  if (unresolvedOperativeState.length > 0) gateFailureReasons.push(`${unresolvedOperativeState.length} semantic unit(s) have an unresolved operative-state conflict (a hidden conflicted operative version)`);

  return {
    documentId,
    units,
    coverageEntries: entries,
    dangerousUnaccounted,
    familySummaries,
    rawFullyRepresentedFraction,
    materialityWeightedFullyRepresentedFraction,
    gateStatus: gateFailureReasons.length > 0 ? "DOCUMENT_GATE_FAILED" : "DOCUMENT_GATE_PASSED",
    gateFailureReasons,
  };
}
