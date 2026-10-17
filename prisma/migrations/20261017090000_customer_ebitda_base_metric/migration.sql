-- EBITDA box: allow BASE_METRIC confirmations (a CFO-confirmed revenue the filings lack, accepted only against ERP
-- evidence; used as a plausibility bound, never added to EBITDA). Only the kind check constraint changes; the value check
-- (non-negative integer <= 1e12, "1" for LENDER_APPROVAL) already covers BASE_METRIC rows.
-- IDEMPOTENT: drop-if-exists then add, inside one transaction (Prisma runs the file as one block), so re-running is a
-- no-op in effect. NOT VALID like the original: enforced for new rows, existing rows are not re-checked. No data changes.
-- Rollback: down.sql in this directory (applied by hand).
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_kind_check";
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_kind_check" CHECK ("kind" IN ('AMOUNT', 'LENDER_APPROVAL', 'BASE_METRIC')) NOT VALID;
