-- Formula representation step 4: narrow-vocabulary formula types —
-- PCT_OF_CNTA and GREATER_OF_FLAT_OR_PCT_CNTA (% of Consolidated Net
-- Tangible Assets), PCT_OF_COST (% of the cost of the financed
-- assets), PCT_OF_CONSIDERATION (% of the aggregate consideration),
-- UTILIZATION_GATE (a utilization-percentage test, not a basket
-- cap), and VALUE_CAP (a non-numeric cap at the cost / fair market
-- value / purchase price of the financed property). Additive only:
-- existing rows are untouched. Postgres ALTER TYPE ADD VALUE cannot
-- run inside a transaction block, so `prisma migrate deploy`
-- handles each as its own statement (same pattern as prior
-- enum-value migrations).
ALTER TYPE "formula_type" ADD VALUE 'PCT_OF_CNTA';
ALTER TYPE "formula_type" ADD VALUE 'GREATER_OF_FLAT_OR_PCT_CNTA';
ALTER TYPE "formula_type" ADD VALUE 'PCT_OF_COST';
ALTER TYPE "formula_type" ADD VALUE 'PCT_OF_CONSIDERATION';
ALTER TYPE "formula_type" ADD VALUE 'UTILIZATION_GATE';
ALTER TYPE "formula_type" ADD VALUE 'VALUE_CAP';
