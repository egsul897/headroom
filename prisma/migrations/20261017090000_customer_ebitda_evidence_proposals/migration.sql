-- EBITDA CFO editing (workstream E part 2): evidence kinds on confirmations, and CFO-proposed add-back items.
-- Confirmations gain sourceKind/sourceRef (where a CFO figure's evidence comes from: the filing, an officer's
-- certificate, the ERP connection, or a CFO-entered source) — nullable so pre-existing rows stay valid; the app
-- reads a missing kind as CFO_ENTERED. Proposals are a new APPEND-ONLY table: a proposal is not a confirmation,
-- it never counts toward EBITDA; the latest row per label is current (re-proposing a label is the edit).
-- IDEMPOTENT: every step is guarded (IF [NOT] EXISTS / catalog checks), so re-running is a no-op. No rows are deleted.
-- Rollback: down.sql in this directory (applied by hand; prisma migrate deploy reads only migration.sql).
-- History: like 20261017030000 / 20261017050000 / 20261017070000, this migration has not been applied to any shared
-- database (Neon is still missing the whole EBITDA chain).

ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "sourceKind" TEXT;
ALTER TABLE "customer_ebitda_confirmations" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;

CREATE SEQUENCE IF NOT EXISTS "customer_ebitda_proposals_seq_seq" AS BIGINT;
CREATE TABLE IF NOT EXISTS "customer_ebitda_proposals" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceRef" TEXT,
  "proposedBy" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "seq" BIGINT NOT NULL DEFAULT nextval('"customer_ebitda_proposals_seq_seq"'),
  CONSTRAINT "customer_ebitda_proposals_pkey" PRIMARY KEY ("id")
);
ALTER SEQUENCE "customer_ebitda_proposals_seq_seq" OWNED BY "customer_ebitda_proposals"."seq";

CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_proposals_seq_key" ON "customer_ebitda_proposals" ("seq");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_proposals_companyId_documentId_idempote_key" ON "customer_ebitda_proposals" ("companyId", "documentId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "customer_ebitda_proposals_companyId_documentId_seq_idx" ON "customer_ebitda_proposals" ("companyId", "documentId", "seq");

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    -- Evidence kind on confirmations: NULL (pre-existing rows) or one of the four kinds.
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_sourceKind_check', $c$CHECK ("sourceKind" IS NULL OR "sourceKind" IN ('SEC_FILING', 'OFFICERS_CERTIFICATE', 'ERP', 'CFO_ENTERED')) NOT VALID$c$),
    ('customer_ebitda_confirmations', 'customer_ebitda_confirmations_sourceRef_check', $c$CHECK ("sourceRef" IS NULL OR length("sourceRef") <= 500) NOT VALID$c$),
    -- Proposal checks (NOT VALID: enforced for every new row; pre-existing rows are not rejected retroactively).
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_label_check', $c$CHECK (length(btrim("label")) BETWEEN 1 AND 200) NOT VALID$c$),
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_amount_check', $c$CHECK ("amount" ~ '^[0-9]{1,13}$' AND "amount"::numeric <= 1000000000000) NOT VALID$c$),
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_source_check', $c$CHECK (length(btrim("source")) > 0) NOT VALID$c$),
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_sourceKind_check', $c$CHECK ("sourceKind" IN ('SEC_FILING', 'OFFICERS_CERTIFICATE', 'ERP', 'CFO_ENTERED')) NOT VALID$c$),
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_sourceRef_check', $c$CHECK ("sourceRef" IS NULL OR length("sourceRef") <= 500) NOT VALID$c$),
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_idempotencyKey_check', $c$CHECK (length("idempotencyKey") BETWEEN 1 AND 200) NOT VALID$c$),
    -- Foreign keys (NOT VALID, as in 20261017050000). RESTRICT: proposal history is part of the audit trail.
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_companyId_fkey', $c$FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID$c$),
    ('customer_ebitda_proposals', 'customer_ebitda_proposals_documentId_companyId_fkey', $c$FOREIGN KEY ("documentId", "companyId") REFERENCES "documents"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID$c$)
  ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name AND conrelid = format('%I', c.tbl)::regclass) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
    END IF;
  END LOOP;
END $$;
