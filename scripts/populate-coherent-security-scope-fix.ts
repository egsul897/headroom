/**
 * Gate-0 eligibility fix (task: "GATE 0: fix a genuine, already-diagnosed
 * eligibility defect") - the ONE data-only change this fix requires.
 *
 * ============================================================================
 * WHAT THIS FIXES
 * ============================================================================
 * Coherent Credit Agreement Permission `coh-ca-d-incr-ratiobased-unsecjr`
 * (code `ca_incremental_ratio_based_unsecured_or_junior`) has an `action`
 * label that reads "Incur debt under the Ratio-Based Incremental Facility,
 * unsecured or junior-secured (unlimited if TNL <= 4.25x)" - but its
 * `eligibilityConditions` column was `null` (no structured condition),
 * so nothing mechanically enforced that restriction. `runSolverForDocument`
 * (lib/covenant-engine.ts) filters eligible permissions only by
 * `documentId` + `grantType`, relying entirely on each permission's own
 * `eligibilityConditions` to enforce secured/unsecured/priority
 * restrictions - this permission had none, so the solver was counting its
 * ratio room toward FIRST-LIEN/PARI-PASSU SECURED debt capacity questions,
 * inflating Coherent's computed secured capacity. Full paper trail:
 * docs/founder-legal-review-2026-08-25.md §3, docs/legal-review-status-model.md §10.
 *
 * ============================================================================
 * THE FIX
 * ============================================================================
 * This script adds exactly ONE structured `EligibilityCondition` (new kind
 * `TRANSACTION_SECURITY_SCOPE`, lib/solver/types.ts / lib/solver/election.ts)
 * to this permission's `eligibilityConditions` JSON column:
 *
 *   { kind: "TRANSACTION_SECURITY_SCOPE", allowedSecurity: "UNSECURED_OR_JUNIOR" }
 *
 * `TRANSACTION_SECURITY_SCOPE` is a GENERALIZED, mechanically-evaluated
 * eligibility-condition kind - not specific to this permission or to
 * Coherent. Any Permission row on any company/document whose action label
 * restricts it to unsecured-only or unsecured-or-junior-secured debt can
 * carry this same condition kind to have that restriction actually enforced
 * by `evaluatePermissionEligibility` (lib/solver/election.ts) against the
 * requesting `Transaction.secured`/`Transaction.requestedLienPriority`
 * fields, and `computeMaximumCapacityFromEvaluations` (lib/solver/service.ts)
 * already excludes any election with a FAILED requirement from
 * maximum-capacity computation - so once this condition is data-present and
 * FAILED for a first-lien/secured transaction, this permission is correctly
 * excluded from secured-capacity results with zero branching on permission
 * code or company anywhere in lib/solver/**.
 *
 * ============================================================================
 * WHAT THIS SCRIPT DOES NOT TOUCH
 * ============================================================================
 * - No other Permission row (28 other Coherent rows untouched).
 * - No other field on this row (action/formulaType/thresholdValue/params/
 *   entityScope/measurementBasis/sectionRef/definedTermRefs/reviewStatus/
 *   notes/modelingStatus all left exactly as they were).
 * - No PermissionRelationship/SharedCapacityConstraint/CollateralPool/
 *   PermissionCollateralScope/IntercreditorAgreement/RuleActivationCondition
 *   row.
 * - No golden_tests row (that reconciliation, if any, is a separate step -
 *   see the Gate-0 report for how Q22/16/17 were actually handled after this
 *   script ran).
 * - No Matthews data at all.
 * - No lib/solver/** algorithm beyond the new, generalized
 *   TRANSACTION_SECURITY_SCOPE condition kind itself (implemented in
 *   lib/solver/types.ts and lib/solver/election.ts, not in this script).
 *
 * Idempotent: re-running this script produces the exact same
 * `eligibilityConditions` value (upsert-by-fixed-condition-id semantics -
 * it replaces the array with the same single-element array every time,
 * rather than appending a duplicate on each run). Safe to re-run.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const PERMISSION_ID = "coh-ca-d-incr-ratiobased-unsecjr";

const SECURITY_SCOPE_CONDITION = {
  id: "coh-ca-d-incr-ratiobased-unsecjr-security-scope",
  description: "Available only for debt that is unsecured or junior-secured (Incremental Amount definition, clause (y))",
  kind: "TRANSACTION_SECURITY_SCOPE",
  allowedSecurity: "UNSECURED_OR_JUNIOR",
  sourceProvision: {
    documentId: "coherent-credit-agreement-2022",
    sectionRef: "Incremental Amount def., clause (y); §6.11(a)",
  },
};

async function main() {
  const before = await prisma.permission.findUnique({ where: { id: PERMISSION_ID } });
  if (!before) {
    throw new Error(`Permission ${PERMISSION_ID} not found - refusing to proceed (this script must not create a new Permission row).`);
  }
  if (before.companyId !== "coherent" || before.documentId !== "coherent-credit-agreement-2022") {
    throw new Error(`Permission ${PERMISSION_ID} companyId/documentId changed unexpectedly - refusing to proceed without re-verification.`);
  }

  const existingConditions = Array.isArray(before.eligibilityConditions) ? (before.eligibilityConditions as unknown[]) : [];
  const alreadyPresent = existingConditions.some((c) => (c as { id?: string }).id === SECURITY_SCOPE_CONDITION.id);

  if (alreadyPresent && existingConditions.length === 1) {
    console.log(`${PERMISSION_ID}.eligibilityConditions already contains exactly the expected condition - no-op, idempotent re-run confirmed.`);
  } else {
    // Replace wholesale with the single expected condition. At the time this
    // script was authored, eligibilityConditions was null/empty for this
    // row - if a future run finds OTHER conditions already present (not
    // expected, but guarded against), they are preserved alongside this one
    // rather than clobbered.
    const otherConditions = existingConditions.filter((c) => (c as { id?: string }).id !== SECURITY_SCOPE_CONDITION.id);
    const newConditions = [...otherConditions, SECURITY_SCOPE_CONDITION];

    await prisma.permission.update({
      where: { id: PERMISSION_ID },
      data: { eligibilityConditions: newConditions as unknown as Prisma.InputJsonValue },
    });
    console.log(`${PERMISSION_ID}.eligibilityConditions updated: ${existingConditions.length} -> ${newConditions.length} condition(s).`);
  }

  const after = await prisma.permission.findUnique({ where: { id: PERMISSION_ID } });
  console.log("Final eligibilityConditions:", JSON.stringify(after?.eligibilityConditions, null, 2));

  // Verify nothing else on the row changed.
  const unchanged =
    after!.action === before.action &&
    after!.formulaType === before.formulaType &&
    String(after!.thresholdValue) === String(before.thresholdValue) &&
    JSON.stringify(after!.params) === JSON.stringify(before.params) &&
    JSON.stringify(after!.entityScope) === JSON.stringify(before.entityScope) &&
    after!.measurementBasis === before.measurementBasis &&
    after!.sectionRef === before.sectionRef &&
    JSON.stringify(after!.definedTermRefs) === JSON.stringify(before.definedTermRefs) &&
    after!.reviewStatus === before.reviewStatus &&
    after!.modelingStatus === before.modelingStatus;
  if (!unchanged) {
    throw new Error("A field other than eligibilityConditions changed on this row - this should never happen. Investigate before trusting this run.");
  }
  console.log("Confirmed: no field other than eligibilityConditions changed on this row.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
