-- P3-FFC2c: FinancialSnapshot @@unique([companyId, asOfDate]).
-- Abort when any (companyId, asOfDate) already has more than one row.
-- This statement does not remove rows and does not choose a surviving row.
-- FinancialState is not constrained here.

DO $$
DECLARE
  duplicate_pairs bigint;
BEGIN
  SELECT COUNT(*) INTO duplicate_pairs
  FROM (
    SELECT 1
    FROM "financial_snapshots"
    GROUP BY "companyId", "asOfDate"
    HAVING COUNT(*) > 1
  ) AS duplicate_pair;

  IF duplicate_pairs > 0 THEN
    RAISE EXCEPTION
      'P3-FFC2c fail-closed: % FinancialSnapshot (companyId, asOfDate) pair(s) already have more than one row. Unique index refused. No silent collapse.',
      duplicate_pairs;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "financial_snapshots_companyId_asOfDate_key" ON "financial_snapshots"("companyId", "asOfDate");
