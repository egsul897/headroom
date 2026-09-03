/**
 * SEMANTIC ACCOUNTABILITY - agreement-level rollup (mission §26). Rolls
 * reconciled UNIT-level results upward into one of three aggregate states.
 * Reuses the existing per-unit vocabulary (compile status, verification
 * status, operative-state uncertainty, unresolved cross-references) and adds
 * only the accountability dimension - no new persisted status is introduced.
 *
 * HARD REQUIREMENT (mission §26): a package with ANY material
 * MISSING_FROM_COMPOSITION item can never be SEMANTICALLY_COMPLETE.
 */
import type { AgreementLevelResult, AgreementSemanticStatus, AgreementUnitInput } from "./types";

export function classifyUnit(unit: AgreementUnitInput): { status: AgreementSemanticStatus; reasons: string[] } {
  const reasons: string[] = [];
  const acc = unit.accountability;
  if (unit.compileStatus === "FAILED") reasons.push("compilation FAILED");
  if (acc && acc.counts.materialMissingFromComposition > 0) reasons.push(`${acc.counts.materialMissingFromComposition} material inventory item(s) MISSING_FROM_COMPOSITION`);
  if (acc && acc.counts.materialQuantitativeValuesMissing > 0) reasons.push(`${acc.counts.materialQuantitativeValuesMissing} material quantitative value(s) missing from the composed IR`);
  if (unit.verifyStatus === "MATERIAL_DISCREPANCY") reasons.push("independent verification found a MATERIAL discrepancy");
  if (reasons.length > 0) return { status: "SEMANTICALLY_INCOMPLETE", reasons };

  if (!acc) reasons.push("no accountability result (inventory/reconciliation did not run)");
  else if (!acc.semanticallyComplete) reasons.push(...(acc.reasons.length > 0 ? acc.reasons : ["accountability did not establish semantic completeness"]));
  if (unit.compileStatus !== "COMPLETED") reasons.push(`compile status ${unit.compileStatus}`);
  if (unit.verifyStatus === null) reasons.push("not independently verified");
  else if (unit.verifyStatus !== "VERIFIED_NO_MATERIAL_GAP_FOUND" && unit.verifyStatus !== "VERIFIED_WITH_NON_MATERIAL_FINDINGS") reasons.push(`verification status ${unit.verifyStatus}`);
  if (unit.operativeStateUncertain) reasons.push("operative state uncertain");
  if (unit.unresolvedCrossReferences > 0) reasons.push(`${unit.unresolvedCrossReferences} unresolved cross-reference(s)`);
  if (reasons.length > 0) return { status: "REVIEW_REQUIRED", reasons };
  return { status: "SEMANTICALLY_COMPLETE", reasons: [] };
}

export function rollupAgreementSemanticStatus(units: AgreementUnitInput[]): AgreementLevelResult {
  const classified = units.map((u) => ({ candidateRef: u.candidateRef, ...classifyUnit(u) }));
  const counts = {
    units: units.length,
    complete: classified.filter((c) => c.status === "SEMANTICALLY_COMPLETE").length,
    incomplete: classified.filter((c) => c.status === "SEMANTICALLY_INCOMPLETE").length,
    reviewRequired: classified.filter((c) => c.status === "REVIEW_REQUIRED").length,
    materialMissingFromComposition: units.reduce((n, u) => n + (u.accountability?.counts.materialMissingFromComposition ?? 0), 0),
    unresolvedCrossReferences: units.reduce((n, u) => n + u.unresolvedCrossReferences, 0),
  };
  const reasons: string[] = [];
  let status: AgreementSemanticStatus;
  if (units.length === 0) {
    status = "REVIEW_REQUIRED";
    reasons.push("no units were compiled");
  } else if (counts.incomplete > 0 || counts.materialMissingFromComposition > 0) {
    status = "SEMANTICALLY_INCOMPLETE";
    reasons.push(`${counts.incomplete} unit(s) SEMANTICALLY_INCOMPLETE; ${counts.materialMissingFromComposition} material item(s) MISSING_FROM_COMPOSITION across the agreement`);
  } else if (counts.reviewRequired > 0) {
    status = "REVIEW_REQUIRED";
    reasons.push(`${counts.reviewRequired} unit(s) require review`);
  } else {
    status = "SEMANTICALLY_COMPLETE";
  }
  return { status, reasons, units: classified.map((c) => ({ candidateRef: c.candidateRef, unitStatus: c.status, reasons: c.reasons })), counts };
}
