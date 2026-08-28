/**
 * Phase 3E §158 - per-family coverage rollup. A declared reconciliation-
 * stage module (reads SemanticUnitCoverageEntry[]/DangerousUnaccountedSemanticUnit[],
 * both reconciliation.ts outputs - never re-derives them). Family taxonomy
 * stays open (MaterialUnitFamily, types.ts) - this module never assumes a
 * fixed, exhaustive family list.
 */
import type { DangerousUnaccountedSemanticUnit, FamilyCoverageSummary, MaterialSemanticUnit, MaterialUnitFamily, SemanticUnitCoverageEntry, SemanticUnitMateriality } from "./types";

const FULLY_REPRESENTED_STATES = new Set(["FULLY_REPRESENTED_VERIFIED", "FULLY_REPRESENTED_REVIEW_REQUIRED"]);
const UNREPRESENTED_STATES = new Set(["UNREPRESENTED", "UNSUPPORTED"]);

function isMaterialOrCritical(m: SemanticUnitMateriality): boolean {
  return m === "CRITICAL" || m === "MATERIAL";
}

/**
 * Computes one FamilyCoverageSummary per distinct family present in the
 * unit set. `entireFamilyMissing` is the document-level gate signal (task's
 * own "missing an entire material family is an automatic document-level
 * gate failure regardless of unit-level percentages") - true only when a
 * family carries at least one CRITICAL/MATERIAL unit and NONE of that
 * family's units achieved any representation at all (not even PARTIAL).
 */
export function computeFamilySummaries(units: MaterialSemanticUnit[], entries: SemanticUnitCoverageEntry[], dangerousUnaccounted: DangerousUnaccountedSemanticUnit[]): FamilyCoverageSummary[] {
  const entryByUnitId = new Map(entries.map((e) => [e.semanticUnitId, e]));
  const dangerousUnitIds = new Set(dangerousUnaccounted.map((d) => d.semanticUnitId));
  const byFamily = new Map<MaterialUnitFamily, MaterialSemanticUnit[]>();
  for (const unit of units) {
    const list = byFamily.get(unit.family) ?? [];
    list.push(unit);
    byFamily.set(unit.family, list);
  }

  const summaries: FamilyCoverageSummary[] = [];
  for (const [family, familyUnits] of byFamily) {
    let fullyRepresentedCount = 0;
    let partiallyRepresentedCount = 0;
    let unrepresentedCount = 0;
    let dangerousUnaccountedCount = 0;
    let hasMaterialOrCriticalUnit = false;
    let hasAnyRepresentation = false;

    for (const unit of familyUnits) {
      const state = entryByUnitId.get(unit.semanticUnitId)?.coverageState;
      if (state && FULLY_REPRESENTED_STATES.has(state)) {
        fullyRepresentedCount += 1;
        hasAnyRepresentation = true;
      } else if (state === "PARTIALLY_REPRESENTED") {
        partiallyRepresentedCount += 1;
        hasAnyRepresentation = true;
      } else if (state && UNREPRESENTED_STATES.has(state)) {
        unrepresentedCount += 1;
      }
      if (dangerousUnitIds.has(unit.semanticUnitId)) dangerousUnaccountedCount += 1;
      if (isMaterialOrCritical(unit.materiality)) hasMaterialOrCriticalUnit = true;
    }

    summaries.push({
      family,
      unitCount: familyUnits.length,
      fullyRepresentedCount,
      partiallyRepresentedCount,
      unrepresentedCount,
      dangerousUnaccountedCount,
      entireFamilyMissing: hasMaterialOrCriticalUnit && !hasAnyRepresentation,
    });
  }

  return summaries;
}
