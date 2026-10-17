-- Rule 186: greater-of flat / % Consolidated Net Worth baskets.
-- Additive only: existing rows are untouched. Postgres ALTER TYPE ADD VALUE
-- cannot run inside a transaction block, so `prisma migrate deploy` handles
-- it as its own statement (same pattern as prior enum-value migrations).
ALTER TYPE "formula_type" ADD VALUE 'GREATER_OF_FLAT_OR_PCT_NET_WORTH';
