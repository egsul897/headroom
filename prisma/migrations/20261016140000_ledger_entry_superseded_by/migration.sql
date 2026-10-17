-- Rule 142: legacy ledger supersession must record who superseded.
-- Additive only; historical rows keep NULL supersededBy (they predate attribution).
-- Distinct from supersededById (the successor entry's id, still unused).
ALTER TABLE "ledger_entries" ADD COLUMN "supersededBy" TEXT;
