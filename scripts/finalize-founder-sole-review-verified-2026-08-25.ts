/**
 * Implements the founder's "Final legal review status instruction"
 * (2026-08-25): for Headroom's internal product/development purposes, the
 * founder's own review is the complete legal-verification standard - no
 * second-attorney/peer/outside-counsel/independent-counsel requirement.
 *
 * Prerequisite already done (separately, via a proper Prisma migration -
 * prisma/migrations/20260825145840_rename_founder_and_peer_reviewed_to_verified):
 * the GoldenTestStatus/LegalReviewStatus enum value FOUNDER_AND_PEER_REVIEWED
 * was RENAMED to VERIFIED (not data-migrated) - every row that carried it
 * automatically carries VERIFIED now, zero rows touched by hand, zero data
 * loss. That migration alone accounts for 6 of Coherent's 30 golden_tests
 * rows and 13 of the 63 legal_review_records rows already reading VERIFIED
 * before this script runs.
 *
 * THIS SCRIPT does the remaining, genuinely new work the rename could not:
 * the founder confirmed he has now reviewed ALL 48 current rows (not just
 * the previously-promoted 6), so the other 42 (24 Coherent + 18 Matthews),
 * which were left UNVERIFIED by the prior task ONLY because the abolished
 * two-reviewer bar wasn't met, are promoted to VERIFIED here.
 *
 * ============================================================================
 * WHAT THIS SCRIPT TOUCHES / DOES NOT TOUCH
 * ============================================================================
 * TOUCHES: golden_tests.status (-> VERIFIED, all 48 rows - a no-op for the 6
 * already VERIFIED by the rename); new LegalReviewRecord rows (one per
 * golden_tests row, id prefix `lrr-policy-verified-2026-08-25-`,
 * reviewStatus VERIFIED); reviewerNotes on the 3 rows with a known
 * engineering discrepancy (Q22, rows 16/17 - appended, never overwritten).
 *
 * DOES NOT TOUCH: expectedAnswer/bindingProvision/bindingDefinedTerms/
 * question on any row (still an unresolved ENGINEERING matter for Q22/16/17
 * - see docs/founder-legal-review-2026-08-25.md §3 - legal verification does
 * not resolve it, per the founder's own §3/§8: "VERIFIED does not mean force
 * a stale number"). No Permission/PermissionRelationship/
 * SharedCapacityConstraint/CollateralPool row. No production solver/engine
 * code. No financial-core arithmetic. Every PRE-EXISTING LegalReviewRecord
 * row (63 of them - the 2026-08-25 closeout's 13 and the prior task's 50
 * founder-solo/superseding records) is left completely untouched - not
 * deleted, not edited - full historical chronology preserved, per the
 * founder's own "do not rewrite historical factual chronology
 * unnecessarily" instruction. This script only ADDS new records superseding
 * them for the current policy.
 *
 * No reviewer name is fabricated. No repository-authorized metadata records
 * the founder's actual legal name anywhere in this codebase (checked before
 * writing this script), so reviewerName stays null throughout; reviewerRole
 * uses the founder's own supplied truthful role, "Founder / Legal Reviewer",
 * per his explicit fallback instruction.
 *
 * Idempotent via upsert / status-already-VERIFIED skip - safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REVIEW_DATE = new Date("2026-08-25");
const REVIEWER_ROLE = "Founder / Legal Reviewer";

const AFFECTED_IDS = {
  q22: "cmt7vicwr002pj1d33vvdfvav",
  row16: "cmt7vicwj002dj1d3bv3zwd1w",
  row17: "cmt7vicwk002fj1d3nnpsqqdp",
} as const;
const affectedIdSet = new Set<string>(Object.values(AFFECTED_IDS));

const POLICY_NOTE_HEAD =
  "[2026-08-25 Final legal review status instruction] Supersedes the prior two-reviewer FOUNDER_AND_PEER_REVIEWED framework: for Headroom's internal product/development purposes, the founder's own review is the complete legal-verification standard. No additional peer/second-attorney/outside-counsel/independent-counsel requirement exists. The founder has personally reviewed this row (question, expected answer, binding provision, assumptions, and its status/determination) and approves the represented legal conclusion. reviewStatus: VERIFIED.";

const ENGINEERING_DISCREPANCY_NOTE =
  " NOTE (legal review vs. engineering correctness remain separate dimensions, per the founder's own §3/§8): this row has a KNOWN, UNRESOLVED engineering/configuration discrepancy (permission coh-ca-d-incr-ratiobased-unsecjr's missing eligibilityConditions - see docs/founder-legal-review-2026-08-25.md §3 and this row's own reviewerNotes for the full analysis). VERIFIED status here means the LEGAL PROPOSITION represented by this row has been reviewed and approved - it does NOT mean the currently stored expectedAnswer/bindingProvision, OR the newer solver-native recomputation, is confirmed correct, and it does NOT force the engine to reproduce either figure. expectedAnswer/bindingProvision are left unchanged; the discrepancy remains separately tracked as an engineering/configuration issue pending a future, separately-authorized fix.";

const ENGINEERING_DISCREPANCY_GOLDEN_NOTE =
  "[2026-08-25 Final legal review status instruction] Founder has reviewed and approved the legal proposition this row represents (status: VERIFIED). This does NOT resolve the previously-documented engineering discrepancy (see the reviewerNotes entry above from 2026-08-25) - legal review and engineering correctness are separate dimensions per the founder's own instruction. expectedAnswer/bindingProvision remain unchanged pending a separate, explicitly-authorized engineering fix.";

async function main() {
  const allRows = await prisma.goldenTest.findMany({
    where: { companyId: { in: ["coherent", "matthews"] } },
    select: { id: true, companyId: true, status: true, reviewerNotes: true },
    orderBy: [{ companyId: "asc" }, { id: "asc" }],
  });
  if (allRows.length !== 48) {
    throw new Error(`Expected exactly 48 golden_tests rows (30 coherent + 18 matthews) - found ${allRows.length}. Refusing to proceed without re-confirming the row set this instruction covers.`);
  }

  let promotedCount = 0;
  for (const row of allRows) {
    if (row.status !== "VERIFIED") {
      await prisma.goldenTest.update({ where: { id: row.id }, data: { status: "VERIFIED" } });
      promotedCount++;
    }

    const isAffected = affectedIdSet.has(row.id);
    const notes = POLICY_NOTE_HEAD + (isAffected ? ENGINEERING_DISCREPANCY_NOTE : "");

    await prisma.legalReviewRecord.upsert({
      where: { id: `lrr-policy-verified-2026-08-25-${row.id}` },
      create: {
        id: `lrr-policy-verified-2026-08-25-${row.id}`,
        companyId: row.companyId,
        reviewedArtifactType: "GOLDEN_TEST",
        reviewedArtifactRef: row.id,
        reviewStatus: "VERIFIED",
        reviewerRole: REVIEWER_ROLE,
        reviewDate: REVIEW_DATE,
        notes,
        sourceVersion: "Founder \"Final legal review status instruction,\" 2026-08-25 (recorded verbatim intent, not a document filename)",
      },
      update: { reviewStatus: "VERIFIED", reviewerRole: REVIEWER_ROLE, reviewDate: REVIEW_DATE, notes },
    });

    if (isAffected && !row.reviewerNotes?.includes(ENGINEERING_DISCREPANCY_GOLDEN_NOTE)) {
      await prisma.goldenTest.update({
        where: { id: row.id },
        data: { reviewerNotes: row.reviewerNotes ? `${row.reviewerNotes}\n\n${ENGINEERING_DISCREPANCY_GOLDEN_NOTE}` : ENGINEERING_DISCREPANCY_GOLDEN_NOTE },
      });
    }
  }
  console.log(`golden_tests.status promoted to VERIFIED for ${promotedCount} row(s) this run (remainder already VERIFIED via the enum rename).`);
  console.log(`Upserted ${allRows.length} lrr-policy-verified-2026-08-25-* LegalReviewRecord rows.`);

  const [byCompanyStatus, totalGolden, totalLrr] = await Promise.all([
    prisma.goldenTest.groupBy({ by: ["companyId", "status"], where: { companyId: { in: ["coherent", "matthews"] } }, _count: true }),
    prisma.goldenTest.count({ where: { companyId: { in: ["coherent", "matthews"] } } }),
    prisma.legalReviewRecord.count({ where: { companyId: { in: ["coherent", "matthews"] } } }),
  ]);
  console.log("\nAfter-state golden_tests status distribution:");
  for (const r of byCompanyStatus) console.log(`  ${r.companyId} / ${r.status}: ${r._count}`);
  console.log(`\nTotal golden_tests (coherent + matthews): ${totalGolden}`);
  console.log(`Total legal_review_records (coherent + matthews): ${totalLrr}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
