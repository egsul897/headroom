-- Durable outbox for legacy FINANCIAL_FACT promotion → NS-4 approved snapshots.
-- Additive only; no changes to ContractInputSnapshot / FinancialSnapshot semantics.

CREATE TABLE "ns4_financial_syncs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cohortKey" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "candidateIds" TEXT[],
    "factsJson" JSONB NOT NULL,
    "snapshotId" TEXT,
    "lastError" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ns4_financial_syncs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ns4_financial_syncs_companyId_cohortKey_key" ON "ns4_financial_syncs"("companyId", "cohortKey");
CREATE INDEX "ns4_financial_syncs_companyId_status_idx" ON "ns4_financial_syncs"("companyId", "status");
CREATE INDEX "ns4_financial_syncs_status_updatedAt_idx" ON "ns4_financial_syncs"("status", "updatedAt");

ALTER TABLE "ns4_financial_syncs" ADD CONSTRAINT "ns4_financial_syncs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
