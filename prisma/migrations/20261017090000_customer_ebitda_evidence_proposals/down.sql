-- Rollback of 20261017090000_customer_ebitda_evidence_proposals (manual: psql -f down.sql, then
-- `prisma migrate resolve --rolled-back 20261017090000_customer_ebitda_evidence_proposals`). IDEMPOTENT: safe to re-run.
-- The proposals table is dropped whole (it did not exist before this migration; its constraints and indexes die
-- with it — the index drops below are no-ops kept for symmetry). The confirmation evidence columns are dropped
-- after their check constraints.
DROP INDEX IF EXISTS "customer_ebitda_proposals_companyId_documentId_seq_idx";
DROP INDEX IF EXISTS "customer_ebitda_proposals_companyId_documentId_idempote_key";
DROP INDEX IF EXISTS "customer_ebitda_proposals_seq_key";
DROP TABLE IF EXISTS "customer_ebitda_proposals";
DROP SEQUENCE IF EXISTS "customer_ebitda_proposals_seq_seq";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_sourceRef_check";
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_sourceKind_check";
ALTER TABLE "customer_ebitda_confirmations" DROP COLUMN IF EXISTS "sourceRef";
ALTER TABLE "customer_ebitda_confirmations" DROP COLUMN IF EXISTS "sourceKind";
