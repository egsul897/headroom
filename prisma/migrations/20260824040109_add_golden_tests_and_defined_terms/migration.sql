-- CreateEnum
CREATE TYPE "defined_term_status" AS ENUM ('UNVERIFIED', 'VERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "golden_query_type" AS ENUM ('LEVERAGE_METRIC', 'PROVISION_CAPACITY', 'DOCUMENT_CAPACITY', 'CROSS_DOCUMENT_CAPACITY', 'DEBT_SIMULATION', 'RP_SIMULATION', 'ASSET_SALE_SIMULATION', 'OUT_OF_SCOPE');

-- CreateEnum
CREATE TYPE "golden_test_status" AS ENUM ('UNVERIFIED', 'LAWYER_VERIFIED', 'DISPUTED');

-- CreateTable
CREATE TABLE "defined_terms" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "sectionRef" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "status" "defined_term_status" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defined_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "golden_tests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "queryType" "golden_query_type" NOT NULL,
    "queryParams" JSONB,
    "expectedAnswer" DECIMAL(18,6),
    "tolerance" DECIMAL(18,6),
    "bindingProvision" TEXT,
    "bindingDefinedTerms" TEXT[],
    "reviewerNotes" TEXT,
    "status" "golden_test_status" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "golden_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CovenantProvisionToDefinedTerm" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "defined_terms_documentId_termName_key" ON "defined_terms"("documentId", "termName");

-- CreateIndex
CREATE UNIQUE INDEX "_CovenantProvisionToDefinedTerm_AB_unique" ON "_CovenantProvisionToDefinedTerm"("A", "B");

-- CreateIndex
CREATE INDEX "_CovenantProvisionToDefinedTerm_B_index" ON "_CovenantProvisionToDefinedTerm"("B");

-- AddForeignKey
ALTER TABLE "defined_terms" ADD CONSTRAINT "defined_terms_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "golden_tests" ADD CONSTRAINT "golden_tests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CovenantProvisionToDefinedTerm" ADD CONSTRAINT "_CovenantProvisionToDefinedTerm_A_fkey" FOREIGN KEY ("A") REFERENCES "covenant_provisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CovenantProvisionToDefinedTerm" ADD CONSTRAINT "_CovenantProvisionToDefinedTerm_B_fkey" FOREIGN KEY ("B") REFERENCES "defined_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
