-- ERP ingestion foundation (lib/erp/**): per-connection inbound-auth +
-- account-reference columns on company_source_connections, the append-only
-- ERP sync-event audit ledger, and the per-fact ERP provenance ledger.
-- Additive only: every new column is nullable or defaulted; no existing row
-- is modified and no existing table is renamed or dropped.

-- CreateEnum
CREATE TYPE "erp_sync_event_outcome" AS ENUM ('APPLIED', 'PARTIALLY_APPLIED', 'NEEDS_ATTENTION', 'WITHHELD', 'DUPLICATE', 'REFUSED_AUTH', 'REFUSED_VALIDATION', 'REFUSED_IDEMPOTENCY_MISMATCH');

-- CreateEnum
CREATE TYPE "erp_fact_status" AS ENUM ('APPLIED', 'CONFLICT', 'WITHHELD_INCOMPLETE', 'UNMAPPED', 'NOT_PROMOTABLE', 'REFUSED');

-- AlterTable: ERP-only columns (null for every other connector type).
-- inboundSecretHash stores ONLY the sha256 hex of the connection's inbound
-- ingestion token - the raw token is never persisted anywhere.
ALTER TABLE "company_source_connections" ADD COLUMN "externalAccountRef" TEXT;
ALTER TABLE "company_source_connections" ADD COLUMN "inboundSecretHash" TEXT;
ALTER TABLE "company_source_connections" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "company_source_connections" ADD COLUMN "updatedBy" TEXT;

-- CreateTable
CREATE TABLE "erp_sync_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "idempotencyKey" TEXT,
    "duplicateOfEventId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "erp_sync_event_outcome" NOT NULL,
    "detail" TEXT,
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "unmappedCount" INTEGER NOT NULL DEFAULT 0,
    "withheldCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "erp_sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_financial_facts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "syncEventId" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "declaredUnit" TEXT NOT NULL,
    "declaredValue" DECIMAL(24,6) NOT NULL,
    "canonicalMetric" TEXT,
    "canonicalField" TEXT,
    "normalizedValue" DECIMAL(24,6),
    "status" "erp_fact_status" NOT NULL,
    "detail" TEXT,
    "financialSnapshotId" TEXT,
    "financialStateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_financial_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "erp_sync_events_connectionId_idempotencyKey_key" ON "erp_sync_events"("connectionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "erp_sync_events_companyId_idx" ON "erp_sync_events"("companyId");

-- CreateIndex
CREATE INDEX "erp_sync_events_connectionId_idx" ON "erp_sync_events"("connectionId");

-- CreateIndex
CREATE INDEX "erp_financial_facts_companyId_idx" ON "erp_financial_facts"("companyId");

-- CreateIndex
CREATE INDEX "erp_financial_facts_connectionId_idx" ON "erp_financial_facts"("connectionId");

-- CreateIndex
CREATE INDEX "erp_financial_facts_syncEventId_idx" ON "erp_financial_facts"("syncEventId");

-- CreateIndex
CREATE INDEX "erp_financial_facts_connectionId_asOfDate_status_idx" ON "erp_financial_facts"("connectionId", "asOfDate", "status");

-- AddForeignKey
ALTER TABLE "erp_sync_events" ADD CONSTRAINT "erp_sync_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_sync_events" ADD CONSTRAINT "erp_sync_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "company_source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_financial_facts" ADD CONSTRAINT "erp_financial_facts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_financial_facts" ADD CONSTRAINT "erp_financial_facts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "company_source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_financial_facts" ADD CONSTRAINT "erp_financial_facts_syncEventId_fkey" FOREIGN KEY ("syncEventId") REFERENCES "erp_sync_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
