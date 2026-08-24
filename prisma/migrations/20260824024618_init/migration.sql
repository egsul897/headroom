-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('CREDIT_AGREEMENT', 'INDENTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "formula_type" AS ENUM ('FLAT_AMOUNT', 'FLAT_NET_OF_DEBT', 'GREATER_OF_FLAT_OR_PCT_EBITDA', 'LEVERAGE_RATIO_ROOM', 'COVERAGE_RATIO_ROOM', 'BUILDER_BASKET', 'RATIO_GATE');

-- CreateEnum
CREATE TYPE "ledger_basket" AS ENUM ('EQUITY', 'DEBT_INCUR', 'DEBT_REPAY', 'ASSET_SALE', 'DIVIDEND', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "ledger_direction" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "cik" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "document_type" NOT NULL,
    "governs" TEXT,
    "executedOn" TIMESTAMP(3),
    "notes" TEXT,
    "capacityFormulas" JSONB,
    "rpWaterfall" JSONB,
    "assetSale" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "covenant_provisions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "basketName" TEXT NOT NULL,
    "sectionRef" TEXT NOT NULL,
    "formulaType" "formula_type" NOT NULL,
    "thresholdValue" DECIMAL(18,6) NOT NULL,
    "params" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "covenant_provisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "ebitda" DECIMAL(18,6) NOT NULL,
    "cash" DECIMAL(18,6) NOT NULL,
    "interestExpense" DECIMAL(18,6) NOT NULL,
    "cumulativeNetIncome" DECIMAL(18,6) NOT NULL,
    "equityProceedsSinceIssue" DECIMAL(18,6) NOT NULL,
    "assumedNewDebtRatePct" DECIMAL(9,6) NOT NULL,
    "totalDebt" DECIMAL(18,6) NOT NULL,
    "securedDebt" DECIMAL(18,6) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "basket" "ledger_basket" NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "direction" "ledger_direction" NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "covenant_provisions_documentId_code_key" ON "covenant_provisions"("documentId", "code");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "covenant_provisions" ADD CONSTRAINT "covenant_provisions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "covenant_provisions" ADD CONSTRAINT "covenant_provisions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_snapshots" ADD CONSTRAINT "financial_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
