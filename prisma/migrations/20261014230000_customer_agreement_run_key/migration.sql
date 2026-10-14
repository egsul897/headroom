-- Additive: re-analysis of the same (company, document, text, parser, pipeline) reuses one run instead of duplicating.
ALTER TABLE "customer_agreement_runs" ADD COLUMN IF NOT EXISTS "runKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "customer_agreement_runs_runKey_key" ON "customer_agreement_runs"("runKey");
