-- CreateEnum
CREATE TYPE "legal_review_status" AS ENUM ('UNVERIFIED', 'FOUNDER_AND_PEER_REVIEWED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "reviewed_artifact_type" AS ENUM ('GOLDEN_TEST', 'PERMISSION', 'RULE_ACTIVATION_CONDITION', 'LEGAL_CONCLUSION');

-- AlterEnum
ALTER TYPE "golden_test_status" ADD VALUE 'FOUNDER_AND_PEER_REVIEWED';

-- CreateTable
CREATE TABLE "legal_review_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reviewedArtifactType" "reviewed_artifact_type" NOT NULL,
    "reviewedArtifactRef" TEXT NOT NULL,
    "reviewStatus" "legal_review_status" NOT NULL DEFAULT 'UNVERIFIED',
    "reviewerName" TEXT,
    "reviewerRole" TEXT,
    "reviewerExperience" TEXT,
    "reviewDate" TIMESTAMP(3),
    "notes" TEXT,
    "sourceVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_review_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_review_records_companyId_idx" ON "legal_review_records"("companyId");

-- CreateIndex
CREATE INDEX "legal_review_records_reviewedArtifactType_reviewedArtifactR_idx" ON "legal_review_records"("reviewedArtifactType", "reviewedArtifactRef");

-- AddForeignKey
ALTER TABLE "legal_review_records" ADD CONSTRAINT "legal_review_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
