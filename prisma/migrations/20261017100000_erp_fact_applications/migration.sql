-- ERP-2 application layer (lib/erp/**): durable record of what the
-- application layer did with each normalized ERP fact - basket-usage
-- ledger writes and EBITDA add-back evidence intake - and the
-- idempotency backbone for ERP delivery. (companyId, connectionId,
-- externalId) is unique so a re-delivered fact can never double-consume
-- a basket. Additive only: one new table, no existing table touched.
-- NOTE for whoever sequences migrations: ERP-1 (ingestion) may add its
-- own migration in the same window; this one must sort after
-- 20261016210000_formula_type_net_worth_grower.

-- CreateEnum
CREATE TYPE "erp_fact_application_kind" AS ENUM ('BASKET_TRANSACTION', 'EBITDA_ADDBACK_EVIDENCE');

-- CreateEnum
CREATE TYPE "erp_fact_application_disposition" AS ENUM ('APPLIED', 'EVIDENCE_RECORDED', 'UNMATCHED', 'CONFLICT', 'REJECTED');

-- CreateTable
CREATE TABLE "erp_fact_applications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" "erp_fact_application_kind" NOT NULL,
    "disposition" "erp_fact_application_disposition" NOT NULL,
    "factKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "amount" DECIMAL(18,6),
    "currency" TEXT,
    "asOf" TIMESTAMP(3),
    "ledgerEntryId" TEXT,
    "matchedProvisionId" TEXT,
    "matchedPermissionId" TEXT,
    "matchedDocumentId" TEXT,
    "reviewStatus" TEXT,
    "detail" TEXT,
    "conflictPayload" JSONB,
    "deliveryCount" INTEGER NOT NULL DEFAULT 1,
    "lastDeliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_fact_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_fact_applications_companyId_disposition_idx" ON "erp_fact_applications"("companyId", "disposition");

-- CreateIndex
CREATE UNIQUE INDEX "erp_fact_applications_companyId_connectionId_externalId_key" ON "erp_fact_applications"("companyId", "connectionId", "externalId");

-- AddForeignKey
ALTER TABLE "erp_fact_applications" ADD CONSTRAINT "erp_fact_applications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
