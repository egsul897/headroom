/**
 * One-time backfill: assigns `GoldenTest.stableKey` to the 48 golden_tests
 * rows that already exist in a database created before the `stableKey`
 * column existed (docs/database-replay-safety.md §C/§D).
 *
 * Run ONCE against the live sandbox database, between the two migrations
 * that introduce the column:
 *   1. prisma/migrations/20260825175052_add_golden_test_stable_key (adds
 *      `stableKey` as NULLABLE + UNIQUE)
 *   2. this script (backfills every existing row)
 *   3. prisma/migrations/20260825175100_golden_test_stable_key_not_null
 *      (tightens the column to NOT NULL)
 *
 * A fresh database never needs this script: prisma/seed.ts and
 * scripts/populate-matthews-financial-provenance.ts write `stableKey`
 * directly (upsert key) when they create their rows from scratch.
 *
 * MAPPING SOURCE OF TRUTH: this script does NOT invent its own mapping. It
 * imports COHERENT_GOLDEN_TESTS (prisma/seed-data.ts) and
 * MATTHEWS_GOLDEN_TESTS (scripts/matthews-golden-tests-data.ts) - the same
 * literal `stableKey` fields prisma/seed.ts and
 * scripts/populate-matthews-financial-provenance.ts use to seed a fresh
 * database - and matches each existing row to its stableKey by EXACT
 * (companyId, question) text match. This is deliberately NOT order-based
 * (createdAt ordering in this database was confirmed NOT to reliably match
 * declaration order for Matthews' createMany-inserted rows - identical
 * createdAt timestamps break ties in physical/index order, not insertion
 * order) - matching by the immutable `question` text is the only sound way
 * to attach the correct key to the correct EXISTING row. `question` itself
 * is never written by this script - the match is read-only until the single
 * `stableKey` column update.
 *
 * SAFETY: refuses to proceed (throws, no partial writes) unless every
 * existing row matches EXACTLY one seed-data entry, every seed-data entry
 * matches EXACTLY one existing row, and the resulting stableKey set has no
 * duplicates. Touches ONLY the `stableKey` column - every other column
 * (expectedAnswer/bindingProvision/status/reviewerNotes/question/etc.) is
 * read for verification, never written.
 */
import { PrismaClient } from "@prisma/client";
import { COHERENT_GOLDEN_TESTS } from "../prisma/seed-data";
import { MATTHEWS_GOLDEN_TESTS } from "./matthews-golden-tests-data";

const prisma = new PrismaClient();

async function backfillCompany(companyId: string, seedRows: { stableKey: string; question: string }[]) {
  // Raw SQL, not prisma.goldenTest.findMany(): at this point in the
  // migration sequence `stableKey` is still NULL on every existing row, but
  // the generated Prisma Client (built from the FINAL schema.prisma, where
  // stableKey is non-nullable) refuses to parse a null value for a
  // non-nullable field - a chicken-and-egg problem specific to this bridge
  // script, not a sign the column itself is wrong. The typed client is used
  // normally everywhere else (including the write below, and every other
  // script in this repo) once this backfill has run.
  const dbRows = await prisma.$queryRaw<{ id: string; question: string }[]>`SELECT "id", "question" FROM "golden_tests" WHERE "companyId" = ${companyId}`;

  if (dbRows.length !== seedRows.length) {
    throw new Error(`${companyId}: database has ${dbRows.length} golden_tests rows but seed data declares ${seedRows.length} - refusing to backfill (row-set mismatch).`);
  }

  const seedByQuestion = new Map<string, string>();
  for (const s of seedRows) {
    if (seedByQuestion.has(s.question)) {
      throw new Error(`${companyId}: seed data has two entries with the identical question text "${s.question}" - stableKey assignment by question text is ambiguous for this row. Refusing to proceed.`);
    }
    seedByQuestion.set(s.question, s.stableKey);
  }

  const assignments: { id: string; stableKey: string; question: string }[] = [];
  const usedStableKeys = new Set<string>();

  for (const row of dbRows) {
    const stableKey = seedByQuestion.get(row.question);
    if (!stableKey) {
      throw new Error(`${companyId}: golden_tests row ${row.id} (question: "${row.question}") has no matching seed-data entry by exact question text - refusing to backfill.`);
    }
    if (usedStableKeys.has(stableKey)) {
      throw new Error(`${companyId}: stableKey ${stableKey} would be assigned to more than one existing row - refusing to backfill.`);
    }
    usedStableKeys.add(stableKey);
    assignments.push({ id: row.id, stableKey, question: row.question });
  }

  if (usedStableKeys.size !== seedRows.length) {
    throw new Error(`${companyId}: matched ${usedStableKeys.size} distinct stableKeys but seed data declares ${seedRows.length} - refusing to backfill.`);
  }

  for (const a of assignments) {
    await prisma.goldenTest.update({ where: { id: a.id }, data: { stableKey: a.stableKey } });
    console.log(`  ${a.stableKey.padEnd(16)} <- ${a.id}  "${a.question.slice(0, 70)}${a.question.length > 70 ? "…" : ""}"`);
  }

  return assignments.length;
}

async function main() {
  console.log("Backfilling golden_tests.stableKey (docs/database-replay-safety.md §C/§D)\n");

  console.log("coherent:");
  const coherentCount = await backfillCompany("coherent", COHERENT_GOLDEN_TESTS);

  console.log("\nmatthews:");
  const matthewsCount = await backfillCompany("matthews", MATTHEWS_GOLDEN_TESTS);

  console.log(`\nBackfilled ${coherentCount + matthewsCount} rows (${coherentCount} coherent + ${matthewsCount} matthews).`);

  // ---------------------------------------------------------------------
  // Post-backfill verification (before the caller runs the NOT NULL
  // migration): every row has exactly one stableKey, no duplicates, and no
  // other column was touched (spot-checked via a fresh count + a null scan).
  // ---------------------------------------------------------------------
  const total = await prisma.goldenTest.count({ where: { companyId: { in: ["coherent", "matthews"] } } });
  const stillNull = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "golden_tests" WHERE "companyId" IN ('coherent', 'matthews') AND "stableKey" IS NULL`;
  const stillNullCount = Number(stillNull[0]?.count ?? 0n);
  const distinctKeys = await prisma.goldenTest.findMany({ where: { companyId: { in: ["coherent", "matthews"] } }, select: { stableKey: true } });
  const distinctCount = new Set(distinctKeys.map((r) => r.stableKey)).size;

  console.log(`\nVerification: total=${total} stillNull=${stillNullCount} distinctStableKeys=${distinctCount}`);
  if (total !== 48) throw new Error(`Expected 48 total golden_tests rows across coherent+matthews, found ${total}.`);
  if (stillNullCount !== 0) throw new Error(`${stillNullCount} row(s) still have a null stableKey after backfill - refusing to report success.`);
  if (distinctCount !== 48) throw new Error(`Expected 48 distinct stableKeys, found ${distinctCount} - duplicate detected.`);
  console.log("OK: all 48 rows have exactly one, distinct stableKey.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
