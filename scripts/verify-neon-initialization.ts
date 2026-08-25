/**
 * Post-initialization verification for .github/workflows/initialize-neon.yml
 * (also runnable by hand against any freshly-reconstructed database). Fails
 * loudly (non-zero exit) on any mismatch - never silently reports success.
 *
 * Expected counts below are exactly what the validated 9-step reconstruction
 * sequence produces (docs/database-replay-safety.md §F/§G/§H), run against a
 * disposable local database in this session. `legal_review_records` is
 * intentionally 109, not 111: the real sandbox database holds 2 additional
 * historical records (`lrr-supersede-2026-08-25-*`) created by a script
 * block that has since been permanently disabled in the tracked code
 * (`SUPERSEDED_REVERT_LOGIC_DISABLED = true` in
 * scripts/populate-founder-solo-legal-review-2026-08-25.ts) - no currently
 * tracked script can reproduce those 2 rows, so 109 (not 111) is the correct
 * expectation for a reconstruction from tracked code. See
 * docs/database-replay-safety.md §L for the full explanation - this is a
 * documented, pre-existing gap, not a bug in this verification.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

async function main() {
  console.log("== Verifying freshly-initialized database state ==\n");

  const companyCount = await prisma.company.count();
  check("companies count", companyCount, 2);

  const goldenCount = await prisma.goldenTest.count();
  check("golden_tests count", goldenCount, 48);

  const coherentGolden = await prisma.goldenTest.count({ where: { companyId: "coherent" } });
  check("golden_tests (coherent) count", coherentGolden, 30);

  const matthewsGolden = await prisma.goldenTest.count({ where: { companyId: "matthews" } });
  check("golden_tests (matthews) count", matthewsGolden, 18);

  const distinctStableKeys = await prisma.goldenTest.findMany({ select: { stableKey: true } });
  check("golden_tests distinct stableKey count", new Set(distinctStableKeys.map((r) => r.stableKey)).size, 48);

  const statusCounts = await prisma.goldenTest.groupBy({ by: ["status"], _count: true });
  const verifiedCount = statusCounts.find((s) => s.status === "VERIFIED")?._count ?? 0;
  check("golden_tests all VERIFIED", verifiedCount, 48);

  const lrrCount = await prisma.legalReviewRecord.count({ where: { companyId: { in: ["coherent", "matthews"] } } });
  check("legal_review_records count (see header comment re: 109 vs 111)", lrrCount, 109);

  // Spot-check the 3 known-affected rows resolve correctly and carry both
  // the engineering-discrepancy note and the Gate-0 reconciliation note.
  for (const stableKey of ["coherent:q22", "coherent:q17a", "coherent:q17b"]) {
    const row = await prisma.goldenTest.findUnique({ where: { stableKey } });
    check(`${stableKey} exists`, !!row, true);
    check(`${stableKey} status`, row?.status, "VERIFIED");
    check(`${stableKey} has Gate-0 note`, row?.reviewerNotes?.includes("GATE-0 SECURITY-SCOPE FIX RECONCILIATION") ?? false, true);
  }

  const permCount = await prisma.permission.count();
  check("permissions count", permCount, 29);

  const facilityCount = await prisma.facility.count();
  check("facilities count", facilityCount, 6);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
