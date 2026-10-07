-- P3-R0 C10: ledger hard-delete becomes supersession.
-- Existing rows stay ACTIVE and keep counting. SUPERSEDED rows are history.

-- CreateEnum
CREATE TYPE "ledger_entry_status" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN "status" "ledger_entry_status" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "ledger_entries" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "ledger_entries" ADD COLUMN "supersededById" TEXT;
