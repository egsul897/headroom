-- CreateEnum
CREATE TYPE "period_type" AS ENUM ('ACTUAL', 'FORECAST', 'PRO_FORMA');

-- CreateEnum
CREATE TYPE "facility_type" AS ENUM ('TERM_LOAN', 'REVOLVER', 'NOTES', 'ABL', 'OTHER');

-- CreateEnum
CREATE TYPE "coupon_type" AS ENUM ('FIXED', 'FLOATING');

-- CreateEnum
CREATE TYPE "debt_event_type" AS ENUM ('ISSUANCE', 'REPAYMENT', 'REFINANCING', 'REDESIGNATION', 'RECLASSIFICATION', 'AMENDMENT', 'LC_ISSUANCE', 'LC_EXPIRATION');

-- AlterTable
ALTER TABLE "external_input_records" ADD COLUMN     "facilityId" TEXT,
ADD COLUMN     "fieldKey" TEXT,
ADD COLUMN     "financialStateId" TEXT;

-- CreateTable
CREATE TABLE "financial_states" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "periodType" "period_type" NOT NULL DEFAULT 'ACTUAL',
    "scope" TEXT NOT NULL DEFAULT 'CONSOLIDATED',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "balanceSheetFacts" JSONB NOT NULL,
    "incomeStatementFacts" JSONB NOT NULL,
    "covenantMetricFacts" JSONB NOT NULL,
    "liquidityFacts" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facilityType" "facility_type" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "originalPrincipal" DECIMAL(18,6) NOT NULL,
    "commitmentAmount" DECIMAL(18,6),
    "borrowingBaseAtOrigination" DECIMAL(18,6),
    "secured" BOOLEAN NOT NULL,
    "couponType" "coupon_type" NOT NULL,
    "couponPct" DECIMAL(9,6),
    "marginBps" INTEGER,
    "referenceRate" TEXT,
    "rateFloorPct" DECIMAL(9,6),
    "maturityDate" TIMESTAMP(3),
    "issuedDate" TIMESTAMP(3),
    "governingDocumentId" TEXT,
    "obligorEntityClasses" "entity_class_tag"[],
    "guarantorEntityClasses" "entity_class_tag"[],
    "collateralPoolIds" TEXT[],
    "originatingPermissionIds" TEXT[],
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "eventType" "debt_event_type" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "refinancesFacilityId" TEXT,
    "relatedPermissionIds" TEXT[],
    "sourceLedgerEntryId" TEXT,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_states_companyId_asOfDate_idx" ON "financial_states"("companyId", "asOfDate");

-- CreateIndex
CREATE INDEX "financial_states_companyId_periodType_idx" ON "financial_states"("companyId", "periodType");

-- CreateIndex
CREATE INDEX "facilities_companyId_idx" ON "facilities"("companyId");

-- CreateIndex
CREATE INDEX "debt_events_companyId_idx" ON "debt_events"("companyId");

-- CreateIndex
CREATE INDEX "debt_events_facilityId_date_idx" ON "debt_events"("facilityId", "date");

-- CreateIndex
CREATE INDEX "external_input_records_financialStateId_idx" ON "external_input_records"("financialStateId");

-- CreateIndex
CREATE INDEX "external_input_records_facilityId_idx" ON "external_input_records"("facilityId");

-- AddForeignKey
ALTER TABLE "external_input_records" ADD CONSTRAINT "external_input_records_financialStateId_fkey" FOREIGN KEY ("financialStateId") REFERENCES "financial_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_input_records" ADD CONSTRAINT "external_input_records_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_states" ADD CONSTRAINT "financial_states_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_events" ADD CONSTRAINT "debt_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_events" ADD CONSTRAINT "debt_events_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

