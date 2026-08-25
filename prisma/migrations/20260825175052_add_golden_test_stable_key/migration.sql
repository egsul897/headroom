-- Replayability fix (docs/database-replay-safety.md): GoldenTest.id is a
-- @default(cuid()) primary key with no natural, content-derived identity, so
-- a fresh `prisma migrate deploy` + reseed regenerates a DIFFERENT cuid for
-- every golden_tests row every time. Several historical review/reconciliation
-- scripts (scripts/populate-coherent-legal-review-provenance.ts,
-- scripts/populate-founder-solo-legal-review-2026-08-25.ts,
-- scripts/finalize-founder-sole-review-verified-2026-08-25.ts,
-- scripts/populate-gate0-golden-reconciliation.ts) hardcode the specific
-- cuid literals generated the one time this sandbox's seed ran - so a fresh
-- database rebuild breaks (or, worse, silently mis-attaches) their output.
--
-- This migration adds a durable, content-derived, company-scoped business
-- key - `stableKey` (format "<companyId>:q<NN>", e.g. "coherent:q22") -
-- that seed/population scripts upsert on and every review/reconciliation
-- script resolves through, instead of assuming a fixed `id`. `id` remains
-- the primary key and every existing relational reference (e.g.
-- LegalReviewRecord.reviewedArtifactRef) is untouched.
--
-- Added NULLABLE here so the 48 existing rows in the live database can be
-- backfilled by a script (scripts/backfill-golden-test-stable-keys.ts -
-- auditable mapping logic, not hand SQL) before the column is tightened to
-- NOT NULL by the next migration
-- (20260825175100_golden_test_stable_key_not_null). No row is deleted,
-- recreated, or has any other column touched by either migration.

ALTER TABLE "golden_tests" ADD COLUMN "stableKey" TEXT;

CREATE UNIQUE INDEX "golden_tests_stableKey_key" ON "golden_tests"("stableKey");
