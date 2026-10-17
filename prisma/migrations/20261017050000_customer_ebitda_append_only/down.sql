-- Rollback of 20261017050000_customer_ebitda_append_only (manual: psql -f down.sql, then
-- `prisma migrate resolve --rolled-back 20261017050000_customer_ebitda_append_only`).
-- Restoring the old one-row-per-key unique index requires collapsing history to the latest AMOUNT row per key:
-- older rows and LENDER_APPROVAL rows are copied to customer_ebitda_confirmations_history_rollback first (nothing lost).
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_documentId_fkey";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_companyId_fkey";
ALTER TABLE "customer_ebitda_boxes" DROP CONSTRAINT IF EXISTS "customer_ebitda_boxes_documentId_fkey";
ALTER TABLE "customer_ebitda_boxes" DROP CONSTRAINT IF EXISTS "customer_ebitda_boxes_companyId_fkey";
ALTER TABLE "customer_ebitda_boxes" DROP CONSTRAINT IF EXISTS "customer_ebitda_boxes_status_check";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_idempotencyKey_check";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_inputKey_check";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_source_check";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_value_check";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_kind_check";

CREATE TABLE IF NOT EXISTS "customer_ebitda_confirmations_history_rollback" AS SELECT * FROM "customer_ebitda_confirmations" WITH NO DATA;
INSERT INTO "customer_ebitda_confirmations_history_rollback"
  SELECT c.* FROM "customer_ebitda_confirmations" c
  WHERE c."kind" <> 'AMOUNT' OR EXISTS (
    SELECT 1 FROM "customer_ebitda_confirmations" n
    WHERE n."companyId" = c."companyId" AND n."documentId" = c."documentId" AND n."inputKey" = c."inputKey" AND n."kind" = 'AMOUNT'
      AND (n."createdAt", n."id") > (c."createdAt", c."id"));
DELETE FROM "customer_ebitda_confirmations" c USING "customer_ebitda_confirmations_history_rollback" h WHERE c."id" = h."id";

DROP INDEX IF EXISTS "customer_ebitda_confirmations_companyId_documentId_inputKey_createdAt_idx";
DROP INDEX IF EXISTS "customer_ebitda_confirmations_companyId_documentId_idempotencyKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_confirmations_companyId_documentId_inputKey_key" ON "customer_ebitda_confirmations" ("companyId", "documentId", "inputKey");
ALTER TABLE "customer_ebitda_confirmations" DROP COLUMN IF EXISTS "idempotencyKey";
ALTER TABLE "customer_ebitda_confirmations" DROP COLUMN IF EXISTS "kind";
