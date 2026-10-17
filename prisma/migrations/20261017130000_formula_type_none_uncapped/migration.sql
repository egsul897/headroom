-- Formula representation step 1: NONE_UNCAPPED — the determinate state for a
-- clause that affirmatively grants a permission without a numeric cap
-- (parseFormulaFromItem). Additive only: existing rows are untouched.
-- Postgres ALTER TYPE ADD VALUE cannot run inside a transaction block, so
-- `prisma migrate deploy` handles it as its own statement (same pattern as
-- prior enum-value migrations).
ALTER TYPE "formula_type" ADD VALUE 'NONE_UNCAPPED';
