-- EBITDA box hardening: append-only CFO confirmations (history kept, latest row per key+kind is current), lender-approval
-- confirmations (kind), idempotency key, FKs to companies/documents, and check constraints. No rows are deleted.
-- Rollback: down.sql in this directory (applied by hand; prisma migrate deploy reads only migration.sql).

ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'AMOUNT';
ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
UPDATE "customer_ebitda_confirmations" SET "idempotencyKey" = 'legacy-' || "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "customer_ebitda_confirmations" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- One row per key was the old model; append-only needs many. The idempotency key is unique per document instead.
DROP INDEX IF EXISTS "customer_ebitda_confirmations_companyId_documentId_inputKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_confirmations_companyId_documentId_idempotencyKey_key" ON "customer_ebitda_confirmations" ("companyId", "documentId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "customer_ebitda_confirmations_companyId_documentId_inputKey_createdAt_idx" ON "customer_ebitda_confirmations" ("companyId", "documentId", "inputKey", "createdAt");

-- Check constraints (NOT VALID: enforced for every new row; pre-existing rows are not rejected retroactively).
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_kind_check" CHECK ("kind" IN ('AMOUNT', 'LENDER_APPROVAL')) NOT VALID;
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_value_check" CHECK ("value" ~ '^[0-9]{1,13}$' AND "value"::numeric <= 1000000000000 AND ("kind" <> 'LENDER_APPROVAL' OR "value" = '1')) NOT VALID;
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_source_check" CHECK (length(btrim("source")) > 0) NOT VALID;
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_inputKey_check" CHECK (length("inputKey") > 0 AND "inputKey" !~ '\s') NOT VALID;
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_idempotencyKey_check" CHECK (length("idempotencyKey") BETWEEN 1 AND 200) NOT VALID;
ALTER TABLE "customer_ebitda_boxes" ADD CONSTRAINT "customer_ebitda_boxes_status_check" CHECK ("status" IN ('READY', 'NEEDS_FINANCIALS', 'NO_EBITDA_DEFINITION')) NOT VALID;

-- Foreign keys (NOT VALID so orphaned legacy rows, if any, do not block the deploy; new rows are checked).
ALTER TABLE "customer_ebitda_boxes" ADD CONSTRAINT "customer_ebitda_boxes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "customer_ebitda_boxes" ADD CONSTRAINT "customer_ebitda_boxes_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
