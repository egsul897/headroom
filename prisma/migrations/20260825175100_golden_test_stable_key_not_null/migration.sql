-- Second half of the golden_tests.stableKey replayability fix (see
-- 20260825175052_add_golden_test_stable_key's migration.sql for the full
-- rationale). By the time this migration runs, every existing golden_tests
-- row has been backfilled with a deterministic stableKey by
-- scripts/backfill-golden-test-stable-keys.ts (run once, by hand, against
-- the live database, between the two migrations - see
-- docs/database-replay-safety.md §C). This migration only tightens the
-- already-unique column to NOT NULL; it does not touch any row's data.

ALTER TABLE "golden_tests" ALTER COLUMN "stableKey" SET NOT NULL;
