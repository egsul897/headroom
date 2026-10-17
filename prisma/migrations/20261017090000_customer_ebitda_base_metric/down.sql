-- Rollback of 20261017090000_customer_ebitda_base_metric: restore the two-kind check. Refuses (raises) if BASE_METRIC
-- rows exist, so confirmation history is never silently invalidated; delete nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "customer_ebitda_confirmations" WHERE "kind" = 'BASE_METRIC') THEN
    RAISE EXCEPTION 'BASE_METRIC confirmations exist; refusing to narrow the kind check';
  END IF;
END $$;
ALTER TABLE "customer_ebitda_confirmations" DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_kind_check";
ALTER TABLE "customer_ebitda_confirmations" ADD CONSTRAINT "customer_ebitda_confirmations_kind_check" CHECK ("kind" IN ('AMOUNT', 'LENDER_APPROVAL')) NOT VALID;
