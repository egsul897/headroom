-- EBITDA box: allow BASE_METRIC confirmations (a CFO-confirmed revenue the filings lack, accepted only against ERP
-- evidence; used as a plausibility bound, never added to EBITDA). Only the kind check constraint changes; the value check
-- (non-negative integer <= 1e12, "1" for LENDER_APPROVAL) already covers BASE_METRIC rows.
-- ATOMIC: the drop and the re-add are subcommands of ONE ALTER TABLE statement, which holds ACCESS EXCLUSIVE for its
-- whole run and commits or fails as a unit even outside a transaction (psql autocommit, a hand-applied run). There is no
-- moment at which the table has no kind check. IDEMPOTENT: re-running replaces the check with the same check.
-- NOT VALID like the original: enforced for new rows, existing rows are not re-checked. No data changes.
-- Rollback: down.sql in this directory (applied by hand).
ALTER TABLE "customer_ebitda_confirmations"
  DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_kind_check",
  ADD CONSTRAINT "customer_ebitda_confirmations_kind_check" CHECK ("kind" IN ('AMOUNT', 'LENDER_APPROVAL', 'BASE_METRIC')) NOT VALID;
