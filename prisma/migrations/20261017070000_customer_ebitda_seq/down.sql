-- Rollback of 20261017070000_customer_ebitda_seq (manual: psql -f down.sql, then
-- `prisma migrate resolve --rolled-back 20261017070000_customer_ebitda_seq`). IDEMPOTENT: safe to re-run.
-- CAVEAT: dropping "seq" discards the recorded write order. A later re-apply (down then up) re-numbers existing rows by
-- ("createdAt", "id"), which can REORDER rows whose createdAt ties (e.g. two writes in the same transaction-time
-- instant): "latest box", the box generation and "latest confirmation per key" may then differ from before the
-- rollback. Before re-applying on data that matters, snapshot (id, seq) and restore it instead of the backfill.
-- Run before the 20261017050000 rollback. Ordering falls back to "createdAt" in code that predates this migration.

DROP INDEX IF EXISTS "customer_ebitda_boxes_companyId_documentId_seq_idx";
DROP INDEX IF EXISTS "customer_ebitda_boxes_seq_key";
ALTER TABLE "customer_ebitda_boxes" DROP COLUMN IF EXISTS "seq";
DROP SEQUENCE IF EXISTS "customer_ebitda_boxes_seq_seq";

DROP INDEX IF EXISTS "customer_ebitda_confirmations_companyId_documentId_seq_idx";
DROP INDEX IF EXISTS "customer_ebitda_confirmations_seq_key";
ALTER TABLE "customer_ebitda_confirmations" DROP COLUMN IF EXISTS "seq";
DROP SEQUENCE IF EXISTS "customer_ebitda_confirmations_seq_seq";
