-- Rule 139: legacy manual ledger entries must carry attribution.
-- Additive only; historical rows keep NULL createdBy (they predate attribution).
ALTER TABLE "ledger_entries" ADD COLUMN "createdBy" TEXT;
