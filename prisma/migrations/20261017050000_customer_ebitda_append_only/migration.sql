-- EBITDA box hardening: append-only CFO confirmations (history kept, latest row per key+kind is current), lender-approval
-- confirmations (kind), idempotency key + stored original response, FKs, document-belongs-to-company, check constraints.
-- IDEMPOTENT: every step is guarded (IF [NOT] EXISTS / catalog checks), so re-running is a no-op. No rows are deleted.
-- Rollback: down.sql in this directory (applied by hand; prisma migrate deploy reads only migration.sql).

ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'AMOUNT';
ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "response" JSONB;
UPDATE "customer_ebitda_confirmations" SET "idempotencyKey" = 'legacy-' || "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "customer_ebitda_confirmations" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- One row per key was the old model; append-only needs many. The idempotency key is unique per document instead.
DROP INDEX IF EXISTS "customer_ebitda_confirmations_companyId_documentId_inputKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_confirmations_companyId_documentId_idempotencyKey_key" ON "customer_ebitda_confirmations" ("companyId", "documentId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "customer_ebitda_confirmations_companyId_documentId_inputKey_createdAt_idx" ON "customer_ebitda_confirmations" ("companyId", "documentId", "inputKey", "createdAt");

-- (id, companyId) is unique on documents (id is the PK), so child rows can reference both: a box or confirmation can
-- only name a document of the same company.
CREATE UNIQUE INDEX IF NOT EXISTS "documents_id_companyId_key" ON "documents" ("id", "companyId");

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    -- Check constraints (NOT VALID: enforced for every new row; pre-existing rows are not rejected retroactively).
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_kind_check', $c$CHECK ("kind" IN ('AMOUNT', 'LENDER_APPROVAL')) NOT VALID$c$),
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_value_check', $c$CHECK ("value" ~ '^[0-9]{1,13}$' AND "value"::numeric <= 1000000000000 AND ("kind" <> 'LENDER_APPROVAL' OR "value" = '1')) NOT VALID$c$),
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_source_check', $c$CHECK (length(btrim("source")) > 0) NOT VALID$c$),
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_inputKey_check', $c$CHECK (length("inputKey") > 0 AND "inputKey" !~ '\s') NOT VALID$c$),
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_idempotencyKey_check', $c$CHECK (length("idempotencyKey") BETWEEN 1 AND 200) NOT VALID$c$),
    ('customer_ebitda_boxes', 'customer_ebitda_boxes_status_check', $c$CHECK ("status" IN ('READY', 'NEEDS_FINANCIALS', 'NO_EBITDA_DEFINITION', 'FAILED')) NOT VALID$c$),
    -- Foreign keys (NOT VALID so orphaned legacy rows, if any, do not block the deploy; new rows are checked).
    -- Boxes are derived snapshots: they follow their company/document. Confirmation history is RESTRICT: a company or
    -- document with CFO confirmations cannot be deleted out from under its audit trail.
    ('customer_ebitda_boxes', 'customer_ebitda_boxes_companyId_fkey', $c$FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID$c$),
    ('customer_ebitda_boxes', 'customer_ebitda_boxes_documentId_companyId_fkey', $c$FOREIGN KEY ("documentId", "companyId") REFERENCES "documents"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID$c$),
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_companyId_fkey', $c$FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID$c$),
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_documentId_companyId_fkey', $c$FOREIGN KEY ("documentId", "companyId") REFERENCES "documents"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID$c$)
  ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name AND conrelid = format('%I', c.tbl)::regclass) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
    END IF;
  END LOOP;
END $$;
