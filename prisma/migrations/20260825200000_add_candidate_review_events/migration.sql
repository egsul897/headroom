-- Company onboarding, Phase 2 (docs/company-onboarding-v1-implementation.md).
--
-- Additive only - one new table, zero existing rows/columns touched. Adds
-- the review-decision audit trail the review workspace needs beyond what
-- ExtractionCandidate.reviewedAt/reviewedBy alone give (those two columns
-- only ever hold the LATEST decision; this table keeps every one).

-- CreateEnum
CREATE TYPE "candidate_review_action" AS ENUM ('APPROVE', 'EDIT', 'REJECT', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "candidate_review_events" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "action" "candidate_review_action" NOT NULL,
    "previousStatus" "extraction_candidate_review_status" NOT NULL,
    "newStatus" "extraction_candidate_review_status" NOT NULL,
    "editedValue" JSONB,
    "note" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_review_events_candidateId_idx" ON "candidate_review_events"("candidateId");

-- AddForeignKey
ALTER TABLE "candidate_review_events" ADD CONSTRAINT "candidate_review_events_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "extraction_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
