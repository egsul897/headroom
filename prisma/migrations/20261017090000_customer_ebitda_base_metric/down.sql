-- Rollback of 20261017090000_customer_ebitda_base_metric: restore the two-kind check. ONE statement (a DO block): it
-- locks the table against writes, refuses (raises) if BASE_METRIC rows exist so confirmation history is never silently
-- invalidated, then swaps the check in a single ALTER TABLE (no window without a kind check, and no BASE_METRIC row can
-- slip in between the existence check and the swap). Deletes nothing.
DO $$
BEGIN
  LOCK TABLE "customer_ebitda_confirmations" IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM "customer_ebitda_confirmations" WHERE "kind" = 'BASE_METRIC') THEN
    RAISE EXCEPTION 'BASE_METRIC confirmations exist; refusing to narrow the kind check';
  END IF;
  ALTER TABLE "customer_ebitda_confirmations"
    DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_kind_check",
    ADD CONSTRAINT "customer_ebitda_confirmations_kind_check" CHECK ("kind" IN ('AMOUNT', 'LENDER_APPROVAL')) NOT VALID;
END $$;
