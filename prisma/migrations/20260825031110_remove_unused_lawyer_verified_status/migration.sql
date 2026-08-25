-- Remove the unused LAWYER_VERIFIED value from golden_test_status.
--
-- Verified before this migration was written: zero golden_tests rows carry
-- status = 'LAWYER_VERIFIED' (SELECT count(*) FROM golden_tests WHERE
-- status = 'LAWYER_VERIFIED' returned 0). Postgres has no DROP VALUE for
-- enum types, so this uses the standard rename/recreate/cast pattern, safe
-- here specifically because no row references the value being dropped.

ALTER TYPE "golden_test_status" RENAME TO "golden_test_status_old";

CREATE TYPE "golden_test_status" AS ENUM ('UNVERIFIED', 'FOUNDER_AND_PEER_REVIEWED', 'DISPUTED');

ALTER TABLE "golden_tests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "golden_tests" ALTER COLUMN "status" TYPE "golden_test_status" USING ("status"::text::"golden_test_status");
ALTER TABLE "golden_tests" ALTER COLUMN "status" SET DEFAULT 'UNVERIFIED';

DROP TYPE "golden_test_status_old";
