/**
 * Records the founder's own, single-reviewer legal-review confirmation
 * (dated 2026-08-25) that he has personally reviewed EVERY currently
 * existing `golden_tests` row for BOTH Coherent and Matthews - question,
 * expected answer, binding provision/citation, status, assumptions, and
 * every REVIEW_REQUIRED/NOT_TESTED/NOT_EVALUABLE/OUT_OF_SCOPE determination.
 *
 * ============================================================================
 * WHY THIS DOES NOT PROMOTE GoldenTest.status TO FOUNDER_AND_PEER_REVIEWED
 * ============================================================================
 * docs/legal-review-status-model.md §2 (and the matching schema comment on
 * `LegalReviewStatus`/`GoldenTestStatus`) define FOUNDER_AND_PEER_REVIEWED as
 * review by BOTH (1) the founder AND (2) a second qualified attorney. The
 * founder's 2026-08-25 instruction supplies only his own review ("I have
 * personally reviewed...") - it does not assert a second reviewer
 * participated, and explicitly anticipates this exact gap: "If the current
 * status name semantically requires a second reviewer and the database
 * requires information I have not supplied, do not fabricate it... identify
 * any purely metadata/status-model mismatch; do not treat that mismatch as a
 * substantive legal blocker on product development."
 *
 * Per that instruction, this script does NOT promote any golden_tests.status
 * to FOUNDER_AND_PEER_REVIEWED on the strength of this single-reviewer
 * confirmation alone (doing so would misrepresent a two-person review as
 * having occurred). It instead records the founder's real, single-reviewer
 * confirmation truthfully as a new `LegalReviewRecord` per row
 * (`reviewStatus: UNVERIFIED` - the honest label for "reviewed by one
 * qualified reviewer, second reviewer not yet supplied," since the enum has
 * no intermediate tier), with `notes` stating plainly what was and wasn't
 * reviewed and by whom. This is the METADATA/STATUS-MODEL MISMATCH the
 * founder's instruction told this task to identify rather than paper over.
 * It is not a substantive legal blocker: no code path gates on
 * GoldenTest.status or LegalReviewStatus (docs/legal-review-status-model.md
 * §6), so leaving the label accurate does not block Phase 10 in any way.
 *
 * ============================================================================
 * IMPORTANT DISCOVERY DURING THIS TASK - NOT A SIMPLE STALE-CITATION FIX
 * ============================================================================
 * The founder's instruction flagged Coherent's Q22 (remaining secured
 * capacity after $500M) and golden rows "16/17" (the SSNL-binding-constraint
 * spot checks) as known-stale per docs/result-semantics-headroom-cleanup.md,
 * with a naive read suggesting the fix is just "update expectedAnswer to
 * 4629 and bindingProvision to the new solver-native citation." Investigating
 * that correction before writing it (per the founder's own governing rule:
 * "update the active golden expectation to the corrected reviewed value only
 * after identifying the exact row and corrected result") surfaced a real,
 * separate, NOT-YET-AUTHORIZED-TO-FIX engineering gap:
 *
 * The new solver-native binding citation for all three rows is permission
 * `coh-ca-d-incr-ratiobased-unsecjr` (code `ca_incremental_ratio_based_unsecured_or_junior`,
 * action "Incur debt under the Ratio-Based Incremental Facility, UNSECURED
 * OR JUNIOR-SECURED (unlimited if TNL <= 4.25x)"). Its own action label
 * restricts it to unsecured/junior-secured debt, but its `eligibilityConditions`
 * column is EMPTY - nothing in the modeled data actually prevents the
 * solver from counting this permission's ratio room toward a FIRST-LIEN/
 * PARI-PASSU SECURED debt query (`lib/covenant-engine.ts`'s `runSolverForDocument`
 * filters eligible permissions only by documentId + grantType, not by
 * secured/unsecured restriction - that filtering is supposed to happen via
 * each permission's own `eligibilityConditions`, which this one lacks). By
 * contrast, the OTHER two Coherent permissions whose citations differ from
 * legacy in this same rerun (`ca_incremental_cash_capped`, `ca_general_debt_601k`)
 * carry no such restrictive action-label language and are genuinely usable
 * for either secured or unsecured debt - those 9 rows' representation
 * differences are NOT affected by this finding and are left exactly as the
 * result-semantics report classified them.
 *
 * Net effect: the "corrected" $4,629M figure and the "corrected"
 * `ca_incremental_ratio_based_unsecured_or_junior` citation for Q22/16/17
 * are THEMSELVES now suspect - likely an OVERSTATEMENT of secured capacity
 * via a permission that should probably be excluded from secured-side
 * eligibility but isn't (a missing `eligibilityConditions` entry on that one
 * Permission row). Neither the old legacy figure (3,541 / mila_secured) NOR
 * the new solver-native figure (4,629 / ca_incremental_ratio_based_unsecured_or_junior)
 * is confirmed correct. Per the founder's own instruction ("do not perform
 * new legal research," "update... only after identifying the exact row and
 * corrected result," "do not silently change any value"), this script:
 *   - does NOT change expectedAnswer/bindingProvision/bindingDefinedTerms for
 *     Q22 or rows 16/17 (old, pre-bug values are left in place - not because
 *     they're confirmed right, but because the proposed replacement isn't
 *     confirmed right either, and no value should be silently substituted);
 *   - DOES revert rows 16/17's `status` from FOUNDER_AND_PEER_REVIEWED back
 *     to UNVERIFIED. That promotion (scripts/populate-coherent-legal-review-provenance.ts,
 *     2026-08-25 closeout) was justified at the time as "matches exactly
 *     between legacy and solver-native" - a premise the golden-harness fix
 *     later disproved (the citation differs) and this task's own
 *     investigation now shows may reflect a real capacity-overstatement bug,
 *     not a benign representation difference. Continuing to display these
 *     two rows as "founder-and-peer reviewed, settled" would be exactly the
 *     "falsely approved merely because [it] exist[s] in the database"
 *     outcome the founder's instruction says not to produce. The ORIGINAL
 *     2026-08-25 LegalReviewRecord row for each is left completely
 *     untouched (immutable historical artifact, preserving what was
 *     believed and why at the time) - this script adds NEW, separate
 *     LegalReviewRecord rows that supersede it and explain why, rather than
 *     overwriting history;
 *   - appends (never overwrites) a plain-language note to `reviewerNotes` on
 *     all three rows recording this finding for any future reader of the
 *     golden_tests table directly, not just the LegalReviewRecord table.
 *   - does NOT modify the `coh-ca-d-incr-ratiobased-unsecjr` Permission row
 *     itself (adding the missing eligibility condition is a genuine, real
 *     fix, but it is a Permission-row change, which this task does not
 *     authorize - "hard freeze: never touch Coherent's ... Permission ...
 *     rows outside an explicitly-authorized task" from every prior phase in
 *     this project). This is reported to the user as a separate, future,
 *     explicitly-authorizable follow-up.
 *
 * ============================================================================
 * WHAT THIS SCRIPT DOES NOT TOUCH
 * ============================================================================
 * No Permission/PermissionRelationship/SharedCapacityConstraint/CollateralPool/
 * PermissionCollateralScope/IntercreditorAgreement/RuleActivationCondition row.
 * No production solver/engine code. No financial-core arithmetic. No
 * expectedAnswer/bindingProvision/bindingDefinedTerms/question value (the
 * three affected rows keep their PRE-EXISTING values; the 45 other rows are
 * never touched at all beyond a new LegalReviewRecord). No reviewer name
 * fabricated (reviewerName stays null throughout - only the founder's own
 * review is being recorded, and no name was supplied for even the founder
 * himself in this instruction).
 *
 * Idempotent via upsert on fixed ids - safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REVIEW_DATE = new Date("2026-08-25");

const SOLO_REVIEWER_NOTE_TAIL =
  "This is a SINGLE-REVIEWER (founder-only) confirmation - the second qualified attorney required by docs/legal-review-status-model.md §2's FOUNDER_AND_PEER_REVIEWED definition has not been supplied. reviewStatus is left UNVERIFIED (the enum has no intermediate tier for 'one qualified reviewer, second pending') rather than promoted - see this script's own header comment and docs/legal-review-status-model.md §2/§3 ('not a rung on a required ladder'; independent/additional review is recorded as an additional LegalReviewRecord, never fabricated). No reviewer name was supplied and none is invented; reviewerRole records only that this is the founder himself.";

// Resolved by `stableKey` (docs/database-replay-safety.md), NOT a hardcoded
// golden_tests.id cuid literal - a fresh database rebuild regenerates every
// GoldenTest.id, so a hardcoded cuid here would silently stop matching any
// row. See resolveAffectedIds() below for the runtime resolution.
const AFFECTED_STABLE_KEYS = {
  q22: "coherent:q22",
  row16: "coherent:q17a",
  row17: "coherent:q17b",
} as const;

async function resolveAffectedIds(): Promise<Record<keyof typeof AFFECTED_STABLE_KEYS, string>> {
  const rows = await prisma.goldenTest.findMany({
    where: { stableKey: { in: Object.values(AFFECTED_STABLE_KEYS) } },
    select: { id: true, stableKey: true },
  });
  if (rows.length !== 3) {
    throw new Error(
      `Expected exactly 3 golden_tests rows for stableKeys ${Object.values(AFFECTED_STABLE_KEYS).join(", ")} - found ${rows.length}. Refusing to proceed.`
    );
  }
  const byStableKey = new Map(rows.map((r) => [r.stableKey, r.id]));
  const result = {} as Record<keyof typeof AFFECTED_STABLE_KEYS, string>;
  for (const key of Object.keys(AFFECTED_STABLE_KEYS) as (keyof typeof AFFECTED_STABLE_KEYS)[]) {
    const id = byStableKey.get(AFFECTED_STABLE_KEYS[key]);
    if (!id) throw new Error(`No golden_tests row found for stableKey ${AFFECTED_STABLE_KEYS[key]}`);
    result[key] = id;
  }
  return result;
}

const GAP_FINDING_NOTE =
  "[2026-08-25 founder-review reconciliation] Founder has reviewed this row and its underlying alternative permission paths. The solver-native-aware harness (post result-semantics fix) now computes a DIFFERENT figure/citation than this row's stored expectedAnswer/bindingProvision (see docs/result-semantics-headroom-cleanup.md and the 2026-08-25 founder-review task). Investigating that difference before writing it as a 'correction' surfaced a real, separate, NOT-YET-FIXED engineering gap: the new citation is permission coh-ca-d-incr-ratiobased-unsecjr (ca_incremental_ratio_based_unsecured_or_junior), whose own action label restricts it to unsecured/junior-secured debt but which carries NO structured eligibilityConditions enforcing that restriction - so the solver currently (and likely incorrectly) counts its ratio room toward SECURED debt capacity. Neither this row's existing expectedAnswer/bindingProvision NOR the new solver-native figure/citation is confirmed correct as a result. Per the founder's own instruction, NEITHER value is being silently changed here; expectedAnswer/bindingProvision are left at their pre-existing values pending a separate, explicitly-authorized fix to that Permission row's eligibility conditions. See scripts/populate-founder-solo-legal-review-2026-08-25.ts's header comment for the full analysis.";

async function reviewRecordForGoldenTest(id: string, companyId: string, question: string, isAffected: boolean) {
  const notes = isAffected
    ? `Founder has personally reviewed this row (question, expected answer, binding provision, assumptions, and the specific alternative-permission-path/citation discrepancy the result-semantics fix surfaced). Approves it as the current, honestly-labeled modeled state - NOT as a confirmed-correct final figure, since the underlying engineering gap described in this script's header comment (permission coh-ca-d-incr-ratiobased-unsecjr's missing eligibility restriction) leaves the true correct value genuinely unresolved. ${SOLO_REVIEWER_NOTE_TAIL}`
    : `Founder has personally reviewed this row (question, expected answer, binding provision/citation, status, assumptions, and - where applicable - its REVIEW_REQUIRED/NOT_TESTED/NOT_EVALUABLE/OUT_OF_SCOPE determination) and approves the currently modeled legal conclusion as accurate. Approval of a fail-closed determination (NOT_TESTED/REVIEW_REQUIRED/NOT_EVALUABLE) means only that the fail-closed state is itself the correct current modeled conclusion, never an affirmative "transaction permitted" conclusion. ${SOLO_REVIEWER_NOTE_TAIL}`;

  await prisma.legalReviewRecord.upsert({
    where: { id: `lrr-founder-solo-2026-08-25-${id}` },
    create: {
      id: `lrr-founder-solo-2026-08-25-${id}`,
      companyId,
      reviewedArtifactType: "GOLDEN_TEST",
      reviewedArtifactRef: id,
      reviewStatus: "UNVERIFIED",
      reviewerRole: "Founder (Headroom) - single reviewer; second qualified attorney not yet supplied",
      reviewDate: REVIEW_DATE,
      notes,
      sourceVersion: "Founder legal-review confirmation instruction, 2026-08-25 (recorded verbatim intent, not a document filename)",
    },
    update: {
      reviewStatus: "UNVERIFIED",
      reviewerRole: "Founder (Headroom) - single reviewer; second qualified attorney not yet supplied",
      reviewDate: REVIEW_DATE,
      notes,
    },
  });
}

async function appendReviewerNote(id: string) {
  const row = await prisma.goldenTest.findUniqueOrThrow({ where: { id } });
  if (row.reviewerNotes?.includes(GAP_FINDING_NOTE)) return; // idempotent
  await prisma.goldenTest.update({
    where: { id },
    data: { reviewerNotes: row.reviewerNotes ? `${row.reviewerNotes}\n\n${GAP_FINDING_NOTE}` : GAP_FINDING_NOTE },
  });
}

async function main() {
  const AFFECTED_IDS = await resolveAffectedIds();
  const affectedIdSet = new Set<string>(Object.values(AFFECTED_IDS));

  const allRows = await prisma.goldenTest.findMany({
    where: { companyId: { in: ["coherent", "matthews"] } },
    select: { id: true, companyId: true, question: true, status: true },
    orderBy: [{ companyId: "asc" }, { id: "asc" }],
  });

  if (allRows.length !== 48) {
    throw new Error(`Expected exactly 48 golden_tests rows (30 coherent + 18 matthews) - found ${allRows.length}. Refusing to proceed without re-confirming the row set this instruction covers.`);
  }

  for (const row of allRows) {
    await reviewRecordForGoldenTest(row.id, row.companyId, row.question, affectedIdSet.has(row.id));
  }
  console.log(`Upserted ${allRows.length} single-reviewer (founder-solo) LegalReviewRecord rows (GOLDEN_TEST) - reviewStatus UNVERIFIED throughout (see header comment).`);

  for (const id of Object.values(AFFECTED_IDS)) {
    await appendReviewerNote(id);
  }
  console.log("Appended engineering-gap-finding note to reviewerNotes for Q22 and rows 16/17 (3 rows).");

  // ---------------------------------------------------------------------
  // SUPERSEDED (2026-08-25, same day, later task) - DO NOT RE-ENABLE.
  // This block originally reverted rows 16/17's status from
  // FOUNDER_AND_PEER_REVIEWED to UNVERIFIED, because at the time this script
  // was authored, "legal review complete" and "no known engineering
  // discrepancy" were the same status dimension. The founder's subsequent
  // "Final legal review status instruction" (docs/legal-review-status-model.md)
  // separated those two dimensions explicitly: a row can be legally VERIFIED
  // while still exposing a known, unresolved engineering discrepancy (§3/§8
  // of that instruction) - and re-promoted rows 16/17 (and Q22) to VERIFIED
  // on exactly that basis (scripts/finalize-founder-sole-review-verified-2026-08-25.ts).
  // Re-running this block today would silently UNDO that later, controlling
  // decision, which is exactly the outcome docs/legal-review-status-model.md
  // now prohibits. The enum rename (FOUNDER_AND_PEER_REVIEWED -> VERIFIED,
  // migration 20260825145840_rename_founder_and_peer_reviewed_to_verified)
  // also removed this block's original type-correct comparison target, so it
  // could not run unmodified even if desired. Left inert (never executes)
  // rather than deleted, so a future reader can see exactly what this script
  // did on 2026-08-25 and why it no longer applies - see
  // lrr-supersede-2026-08-25-* (created below, historical, still accurate as
  // a record of that moment) for the reasoning that WAS current then.
  // ---------------------------------------------------------------------
  const SUPERSEDED_REVERT_LOGIC_DISABLED = true;
  if (!SUPERSEDED_REVERT_LOGIC_DISABLED) {
    for (const id of [AFFECTED_IDS.row16, AFFECTED_IDS.row17]) {
      await prisma.legalReviewRecord.upsert({
        where: { id: `lrr-supersede-2026-08-25-${id}` },
        create: {
          id: `lrr-supersede-2026-08-25-${id}`,
          companyId: "coherent",
          reviewedArtifactType: "GOLDEN_TEST",
          reviewedArtifactRef: id,
          reviewStatus: "UNVERIFIED",
          reviewerRole: "Founder (Headroom) - single reviewer",
          reviewDate: REVIEW_DATE,
          notes: `SUPERSEDES coh-lrr-golden-${id} (2026-08-25 closeout), WITHOUT deleting or editing it - that record is preserved as the accurate historical account of what was believed at the time ("matches exactly between legacy and solver-native"). The golden-harness solver-native-grading fix (docs/golden-harness-solver-native-grading-fix.md) and the result-semantics cleanup (docs/result-semantics-headroom-cleanup.md) subsequently proved that premise false: the solver-native binding citation for this row differs from the legacy one. This task's own investigation (see scripts/populate-founder-solo-legal-review-2026-08-25.ts header) further found the new citation itself rests on an under-modeled Permission (coh-ca-d-incr-ratiobased-unsecjr, missing eligibilityConditions restricting it to unsecured/junior debt). golden_tests.status is therefore reverted from its prior promoted status to UNVERIFIED - continuing to show this row as settled would misrepresent a genuinely open engineering question as reviewed and closed. expectedAnswer/bindingProvision are NOT changed (still "mila_secured" / 1) - not because they are confirmed correct, but because the proposed replacement is not confirmed correct either, and no value is being silently substituted.`,
          sourceVersion: "docs/result-semantics-headroom-cleanup.md; docs/golden-harness-solver-native-grading-fix.md; Founder legal-review confirmation instruction, 2026-08-25",
        },
        update: {},
      });
    }
  } else {
    console.log("Skipped the rows-16/17 revert block: superseded by the founder's 2026-08-25 'Final legal review status instruction' (see header comment above). No golden_tests.status change made by this run.");
  }

  const [byStatusAfter, lrrCount] = await Promise.all([
    prisma.goldenTest.groupBy({ by: ["companyId", "status"], where: { companyId: { in: ["coherent", "matthews"] } }, _count: true }),
    prisma.legalReviewRecord.count({ where: { companyId: { in: ["coherent", "matthews"] } } }),
  ]);
  console.log("\nAfter-state golden_tests status distribution:");
  for (const row of byStatusAfter) console.log(`  ${row.companyId} / ${row.status}: ${row._count}`);
  console.log(`\nTotal legal_review_records (coherent + matthews): ${lrrCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
