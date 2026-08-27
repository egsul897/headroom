-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "amendment_effect_type" ADD VALUE 'MODIFY_PROVISION';
ALTER TYPE "amendment_effect_type" ADD VALUE 'UNKNOWN_CHANGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "document_type" ADD VALUE 'AMENDED_AND_RESTATED_AGREEMENT';
ALTER TYPE "document_type" ADD VALUE 'SUPPLEMENTAL_INDENTURE';
ALTER TYPE "document_type" ADD VALUE 'JOINDER';
ALTER TYPE "document_type" ADD VALUE 'SECURITY_AGREEMENT';
ALTER TYPE "document_type" ADD VALUE 'GUARANTEE';
ALTER TYPE "document_type" ADD VALUE 'SIDE_LETTER';
ALTER TYPE "document_type" ADD VALUE 'FEE_LETTER';
ALTER TYPE "document_type" ADD VALUE 'OTHER_DEBT_DOCUMENT';
ALTER TYPE "document_type" ADD VALUE 'UNKNOWN';

-- AlterTable
ALTER TABLE "amendment_effects" ADD COLUMN     "resolutionMethod" TEXT,
ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "targetDefinedTermRef" TEXT,
ADD COLUMN     "targetDocumentId" TEXT,
ADD COLUMN     "targetSectionRef" TEXT,
ADD COLUMN     "unresolvedReason" TEXT;

-- AlterTable
ALTER TABLE "document_relationship_edges" ADD COLUMN     "resolutionMethod" TEXT,
ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "targetHint" TEXT,
ADD COLUMN     "unresolvedReason" TEXT,
ALTER COLUMN "targetDocumentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "instrumentId" TEXT;

-- CreateTable
CREATE TABLE "debt_instruments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instrumentType" "facility_type",
    "baseDocumentId" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_instruments_companyId_idx" ON "debt_instruments"("companyId");

-- CreateIndex
CREATE INDEX "amendment_effects_targetDocumentId_idx" ON "amendment_effects"("targetDocumentId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "debt_instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_instruments" ADD CONSTRAINT "debt_instruments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_instruments" ADD CONSTRAINT "debt_instruments_baseDocumentId_fkey" FOREIGN KEY ("baseDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_effects" ADD CONSTRAINT "amendment_effects_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
